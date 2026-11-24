import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import {
  CurrencyCode,
  CurrentUser,
  GroupId,
  groupScope,
  MemberRole,
  MinorUnits,
  PlayerId,
  ScopeCloseCode,
  TableId,
  tableScope,
  UserId,
  type AccountDeletionPreview,
  type DeleteAccountRequest,
} from "@stacks/contracts";
import { inGroupAt } from "@stacks/shared/tripTables";

import { AppleSignIn } from "../auth/AppleSignIn.ts";
import { ClerkAdmin } from "../auth/ClerkAdmin.ts";
import * as Access from "./Access.ts";
import * as AccountFence from "./AccountFence.ts";
import { DELETED_ACTOR, DELETED_USER } from "./AccountFence.ts";
import * as Realtime from "./Realtime.ts";
import * as Recording from "./Recording.ts";
import * as Views from "./Views.ts";

const Timestamp = Schema.DateTimeUtcFromDate;

class SuccessorGone extends Data.TaggedError("SuccessorGone")<{ readonly groupId: GroupId }> {}

const MembershipPlanRow = Schema.Struct({
  groupId: GroupId,
  name: Schema.String,
  currency: CurrencyCode,
  role: MemberRole,
  active: Schema.Boolean,
  playerId: PlayerId,
  othersEver: Schema.Int,
  othersActive: Schema.Int,
  otherOwners: Schema.Int,
});

const SuccessorRow = Schema.Struct({
  userId: UserId,
  playerId: PlayerId,
  displayName: Schema.String,
});

const plan = Effect.fn("Account.plan")(function* (userId: string) {
  const sql = yield* SqlClient.SqlClient;

  const memberships = yield* sql`
    select m.group_id, g.name, g.currency, m.role, m.left_at is null as active, p.id as player_id,
      (select count(*)::int from memberships o
        where o.group_id = m.group_id and o.user_id <> m.user_id) as others_ever,
      (select count(*)::int from memberships o
        where o.group_id = m.group_id and o.user_id <> m.user_id and o.left_at is null)
        as others_active,
      (select count(*)::int from memberships o
        where o.group_id = m.group_id and o.user_id <> m.user_id and o.left_at is null
          and o.role = 'owner') as other_owners
    from memberships m
    join groups g on g.id = m.group_id
    join players p on p.group_id = m.group_id and p.user_id = m.user_id
    where m.user_id = ${userId}
    order by g.created_at, g.id
  `.pipe(Effect.flatMap(Access.decodeRows(MembershipPlanRow)));

  const staying = memberships.filter((row) => row.othersEver > 0);

  const handovers = yield* Effect.forEach(
    staying.filter(
      (row) => row.active && row.role === "owner" && row.otherOwners === 0 && row.othersActive > 0,
    ),
    (row) =>
      sql`
        select m.user_id, p.id as player_id, p.display_name
        from memberships m
        join players p on p.group_id = m.group_id and p.user_id = m.user_id
        where m.group_id = ${row.groupId} and m.user_id <> ${userId} and m.left_at is null
        order by m.role = 'admin' desc, m.joined_at, m.user_id
        limit 1
      `.pipe(
        Effect.flatMap(Access.decodeRows(SuccessorRow)),
        Effect.map(([successor]) => ({ group: row, successor: successor! })),
      ),
  );

  return { solo: memberships.filter((row) => row.othersEver === 0), staying, handovers };
});

/** What deleting the account will do, for the person to read before they confirm. */
export const preview = Effect.fn("Account.preview")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  const { solo, staying, handovers } = yield* plan(userId);

  const named = (row: { readonly groupId: GroupId; readonly name: string }) => ({
    id: row.groupId,
    name: row.name,
  });

  const balances = yield* Effect.forEach(staying, (row) =>
    Views.groupBalances(row.groupId).pipe(
      Effect.map(({ owed }) => ({
        group: named(row),
        currency: row.currency,
        amount: owed.get(row.playerId) ?? MinorUnits.make(0),
      })),
    ),
  );

  const stakes = yield* Effect.forEach(staying, (row) =>
    sql`
      select count(*)::int as count from stakes
      where group_id = ${row.groupId} and ended_at is null and voided_at is null
        and (lender_id = ${row.playerId} or borrower_id = ${row.playerId})
    `.pipe(
      Effect.flatMap(Access.decodeRows(Schema.Struct({ count: Schema.Int }))),
      Effect.map(([found]) => ({ group: named(row), count: found!.count })),
    ),
  );

  const clerk = yield* ClerkAdmin;

  const appleLinked = yield* clerk
    .appleLinked(userId)
    .pipe(Effect.catchTag("ClerkUnavailable", () => Effect.succeed(false)));

  return {
    soloGroups: solo.map(named),
    ownershipMoves: handovers.map(({ group, successor }) => ({
      group: named(group),
      newOwner: { playerId: successor.playerId, displayName: successor.displayName },
    })),
    openBalances: balances.filter((row) => row.amount !== 0),
    openStakes: stakes.filter((row) => row.count > 0),
    appleLinked,
  } satisfies AccountDeletionPreview;
});

const PlayerRow = Schema.Struct({
  id: PlayerId,
  groupId: Schema.NullOr(GroupId),
  actorId: Schema.NullOr(Schema.String),
});

const StartedTableRow = Schema.Struct({
  id: TableId,
  shareTokenHash: Schema.NullOr(Schema.String),
  alone: Schema.Boolean,
});

const PinRow = Schema.Struct({
  visitId: Schema.String,
  startedAt: Timestamp,
  playerId: PlayerId,
  leftAt: Schema.NullOr(Timestamp),
  groupId: GroupId,
});

const AbsenceRow = Schema.Struct({ groupId: GroupId, leftAt: Timestamp, returnedAt: Timestamp });

const pinVisits = Effect.fn("Account.pinVisits")(function* (userId: string) {
  const sql = yield* SqlClient.SqlClient;

  const rows = yield* sql`
    select v.id as visit_id, v.started_at, gp.id as player_id, m.left_at, tr.group_id
    from personal_visits v
    join players own on own.id = v.player_id and own.user_id = ${userId}
    join tables t on t.id = v.table_id
    join trips tr on tr.id = t.trip_id
    join players gp on gp.group_id = tr.group_id and gp.user_id = ${userId}
    join memberships m on m.group_id = gp.group_id and m.user_id = gp.user_id
    where v.deleted_at is null and v.group_player_id is null
  `.pipe(Effect.flatMap(Access.decodeRows(PinRow)));

  const absences = yield* sql`
    select group_id, left_at, returned_at from membership_absences where user_id = ${userId}
  `.pipe(Effect.flatMap(Access.decodeRows(AbsenceRow)));

  for (const row of rows) {
    const counts = inGroupAt(row.startedAt, {
      leftAt: row.leftAt,
      absences: absences.filter((absence) => absence.groupId === row.groupId),
    });

    if (counts)
      yield* sql`update personal_visits set group_player_id = ${row.playerId} where id = ${row.visitId}`;
  }
});

const deleteSoloGroups = Effect.fn("Account.deleteSoloGroups")(function* (
  groupIds: ReadonlyArray<GroupId>,
) {
  const sql = yield* SqlClient.SqlClient;

  if (groupIds.length === 0) return;
  const groups = sql.in(groupIds);

  const sessions = sql`(select id from sessions where group_id in ${groups})`;
  const legacyTables = sql`(select id from tables where legacy_session_id in ${sessions})`;
  const players = sql`(select id from players where group_id in ${groups})`;

  yield* sql`
    delete from personal_entries
    where visit_id in (select id from personal_visits where legacy_session_id in ${sessions})
  `;
  yield* sql`delete from personal_visits where legacy_session_id in ${sessions}`;
  yield* sql`delete from personal_operations where table_id in ${legacyTables}`;
  yield* sql`delete from tables where legacy_session_id in ${sessions}`;
  yield* sql`update personal_visits set group_player_id = null where group_player_id in ${players}`;
  yield* sql`
    update tables set trip_id = null where trip_id in (select id from trips where group_id in ${groups})
  `;
  yield* sql`delete from entries where group_id in ${groups}`;
  yield* sql`delete from stakes where group_id in ${groups}`;
  yield* sql`delete from seatings where group_id in ${groups}`;
  yield* sql`delete from session_players where group_id in ${groups}`;
  yield* sql`delete from sessions where group_id in ${groups}`;
  yield* sql`delete from trips where group_id in ${groups}`;
  yield* sql`delete from venues where group_id in ${groups}`;
  yield* sql`delete from invites where group_id in ${groups}`;
  yield* sql`delete from membership_absences where group_id in ${groups}`;
  yield* sql`delete from memberships where group_id in ${groups}`;
  yield* sql`delete from players where group_id in ${groups}`;
  yield* sql`delete from groups where id in ${groups}`;

  for (const groupId of groupIds)
    yield* Realtime.closed({
      scope: groupScope(groupId),
      selector: { kind: "all" },
      code: ScopeCloseCode.revoked,
    });
});

const releaseTables = Effect.fn("Account.releaseTables")(function* (
  mine: ReadonlyArray<PlayerId>,
  soloGroups: ReadonlyArray<GroupId>,
) {
  const sql = yield* SqlClient.SqlClient;

  if (mine.length === 0) return;
  const own = sql.in(mine);

  const inSolo =
    soloGroups.length === 0
      ? sql`false`
      : sql`t.trip_id in (select id from trips where group_id in ${sql.in(soloGroups)})`;

  const started = yield* sql`
    select t.id, t.share_token_hash,
      t.legacy_session_id is null
        and not exists (
          select 1 from personal_visits v where v.table_id = t.id and v.player_id not in ${own})
        and not exists (
          select 1 from table_participants tp where tp.table_id = t.id and tp.player_id not in ${own})
        and (t.trip_id is null or ${inSolo})
        as alone
    from tables t where t.starter_player_id in ${own}
  `.pipe(Effect.flatMap(Access.decodeRows(StartedTableRow)));

  const doomed = started.flatMap((table) => (table.alone ? [table.id] : []));

  if (doomed.length > 0) {
    const tables = sql.in(doomed);
    const visits = sql`(select id from personal_visits where table_id in ${tables})`;
    yield* sql`delete from personal_entries where visit_id in ${visits}`;
    yield* sql`delete from personal_visits where table_id in ${tables}`;
    yield* sql`delete from personal_operations where table_id in ${tables}`;
    yield* sql`delete from table_participants where table_id in ${tables}`;
    yield* sql`delete from tables where id in ${tables}`;

    for (const id of doomed)
      yield* Realtime.closed({
        scope: tableScope(id),
        selector: { kind: "all" },
        code: ScopeCloseCode.tableDeleted,
      });
  }

  for (const table of started) {
    if (table.alone || table.shareTokenHash === null) continue;
    yield* sql`update tables set share_token_hash = null where id = ${table.id}`;
    yield* Realtime.closed({
      scope: tableScope(table.id),
      selector: { kind: "share", shareHash: table.shareTokenHash },
      code: ScopeCloseCode.revoked,
    });
  }
});

const passOwnership = Effect.fn("Account.passOwnership")(function* (
  handovers: ReadonlyArray<{
    readonly group: { readonly groupId: GroupId };
    readonly successor: { readonly userId: UserId };
  }>,
) {
  const sql = yield* SqlClient.SqlClient;

  for (const { group, successor } of handovers) {
    const promoted = yield* sql`
      update memberships set role = 'owner'
      where group_id = ${group.groupId} and user_id = ${successor.userId} and left_at is null
      returning user_id
    `;

    if (promoted.length === 0) return yield* new SuccessorGone({ groupId: group.groupId });
  }
});

const detachRecording = Effect.fn("Account.detachRecording")(function* (
  userId: string,
  mine: ReadonlyArray<typeof PlayerRow.Type>,
) {
  const sql = yield* SqlClient.SqlClient;
  const actor = mine.find((player) => player.actorId !== null)?.actorId ?? null;
  const tablePlayers = mine.flatMap((player) => (player.groupId === null ? [player.id] : []));

  const held =
    mine.length === 0
      ? []
      : yield* sql<{ playerId: PlayerId; actorId: string }>`
          select player_id, actor_id from player_actors
          where player_id in ${sql.in(mine.map(({ id }) => id))}
        `;

  if (mine.length > 0) {
    yield* sql`delete from player_invites where player_id in ${sql.in(mine.map(({ id }) => id))}`;
    yield* sql`delete from player_actors where player_id in ${sql.in(mine.map(({ id }) => id))}`;
  }

  if (actor !== null) {
    yield* sql`update player_actors set invited_by_actor = null where invited_by_actor = ${actor}`;
    yield* sql`delete from player_invites where issued_by_actor = ${actor}`;
    yield* sql`delete from player_actors where actor_id = ${actor}`;
    yield* sql`
      update players
      set user_id = null, recording_actor_id = null, created_by = ${DELETED_USER}
      where user_id = ${userId} and recording_actor_id = ${actor}
    `;
    yield* sql`update players set created_by_actor = ${DELETED_ACTOR} where created_by_actor = ${actor}`;
    yield* sql`update personal_operations set actor_id = ${DELETED_ACTOR} where actor_id = ${actor}`;
    yield* sql`
      update personal_operations
      set command = jsonb_set(command, '{actorId}', to_jsonb(${DELETED_ACTOR}::text))
      where command ->> 'actorId' = ${actor}
    `;
    yield* sql`update personal_entries set created_by = ${DELETED_ACTOR} where created_by = ${actor}`;
    yield* sql`update personal_entries set voided_by = ${DELETED_ACTOR} where voided_by = ${actor}`;
    yield* sql`delete from recording_actors where id = ${actor}`;
  }

  yield* sql`update players set user_id = null where user_id = ${userId} and group_id is null`;

  for (const player of tablePlayers) {
    const actors = held.flatMap((binding) =>
      binding.playerId === player ? [binding.actorId] : [],
    );

    yield* Recording.bindingsRevoked(
      player,
      Array.from(new Set(actor === null ? actors : [...actors, actor])),
    );
  }
});

const moveAudit = Effect.fn("Account.moveAudit")(function* (userId: string) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`delete from invites where created_by = ${userId}`;
  yield* sql`update entries set created_by = ${DELETED_USER} where created_by = ${userId}`;
  yield* sql`update entries set voided_by = ${DELETED_USER} where voided_by = ${userId}`;
  yield* sql`update stakes set created_by = ${DELETED_USER} where created_by = ${userId}`;
  yield* sql`update stakes set voided_by = ${DELETED_USER} where voided_by = ${userId}`;
  yield* sql`update sessions set created_by = ${DELETED_USER} where created_by = ${userId}`;
  yield* sql`update sessions set closed_by = ${DELETED_USER} where closed_by = ${userId}`;
  yield* sql`update seatings set created_by = ${DELETED_USER} where created_by = ${userId}`;
  yield* sql`update trips set created_by = ${DELETED_USER} where created_by = ${userId}`;
  yield* sql`update groups set created_by = ${DELETED_USER} where created_by = ${userId}`;
  yield* sql`update players set created_by = ${DELETED_USER} where created_by = ${userId}`;
  yield* sql`update venues set created_by = null where created_by = ${userId}`;
});

const lockInOrder = Effect.fn("Account.lockInOrder")(function* (
  userId: string,
  mine: ReadonlyArray<typeof PlayerRow.Type>,
  groups: ReadonlyArray<{ readonly groupId: GroupId }>,
  handovers: ReadonlyArray<{
    readonly group: { readonly groupId: GroupId };
    readonly successor: { readonly userId: UserId };
  }>,
) {
  const sql = yield* SqlClient.SqlClient;
  const actor = mine.find((player) => player.actorId !== null)?.actorId ?? null;

  const players =
    mine.length === 0 ? sql`false` : sql`player_id in ${sql.in(mine.map(({ id }) => id))}`;

  const bindings =
    actor === null ? sql`false` : sql`actor_id = ${actor} or invited_by_actor = ${actor}`;

  if (mine.length > 0)
    yield* sql`
      select id from players where id in ${sql.in(mine.map(({ id }) => id))}
      order by id for no key update
    `;

  yield* sql`
    select 1 from player_actors where ${players} or ${bindings} order by player_id, actor_id for update
  `;

  if (mine.length > 0)
    yield* sql`
      select id from tables where starter_player_id in ${sql.in(mine.map(({ id }) => id))}
      order by id for update
    `;

  const rows = [
    ...groups.map(({ groupId }) => ({ groupId, userId })),
    ...handovers.map(({ group, successor }) => ({
      groupId: group.groupId,
      userId: successor.userId,
    })),
  ].toSorted((a, b) => a.groupId.localeCompare(b.groupId) || a.userId.localeCompare(b.userId));

  for (const row of rows)
    yield* sql`
      select 1 from memberships where group_id = ${row.groupId} and user_id = ${row.userId} for update
    `;
});

const cleanup = Effect.fn("Account.cleanup")(function* (userId: string) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`select set_config('stacks.account_deletion', 'on', true)`;
  yield* sql`
    select id from groups
    where id in (select group_id from memberships where user_id = ${userId})
    order by id for update
  `;
  const { solo, staying, handovers } = yield* plan(userId);
  const soloGroups = solo.map((row) => row.groupId);

  const mine = yield* sql`
    select id, group_id, recording_actor_id as actor_id from players where user_id = ${userId}
  `.pipe(Effect.flatMap(Access.decodeRows(PlayerRow)));

  yield* lockInOrder(userId, mine, [...solo, ...staying], handovers);

  const memberOf = yield* sql`select group_id from memberships where user_id = ${userId}`.pipe(
    Effect.flatMap(Access.decodeRows(Schema.Struct({ groupId: GroupId }))),
  );

  yield* releaseTables(
    mine.map(({ id }) => id),
    soloGroups,
  );
  yield* pinVisits(userId);
  yield* deleteSoloGroups(soloGroups);
  yield* passOwnership(handovers);

  for (const player of mine) {
    if (player.groupId === null || soloGroups.includes(player.groupId)) continue;

    yield* sql`
      update players set user_id = null, claimed_at = null, claim_code = ${Access.randomCode()}
      where id = ${player.id}
    `;
  }

  yield* sql`delete from membership_absences where user_id = ${userId}`;
  yield* sql`delete from memberships where user_id = ${userId}`;
  yield* detachRecording(userId, mine);
  yield* moveAudit(userId);
  yield* sql`delete from users where id = ${userId}`;

  for (const { groupId } of memberOf) {
    if (soloGroups.includes(groupId)) continue;
    yield* Realtime.changed(groupScope(groupId));
    yield* Realtime.closed({
      scope: groupScope(groupId),
      selector: { kind: "user", userId },
      code: ScopeCloseCode.revoked,
    });
    yield* Recording.memberGone(groupId, userId);
  }
});

const jobState = Effect.fn("Account.jobState")(function* (hash: string) {
  const sql = yield* SqlClient.SqlClient;

  const [job] = yield* sql<{ complete: boolean }>`
    select clerk_deleted_at is not null as complete from account_deletions
    where user_id_hash = ${hash}
  `;

  return job === undefined ? null : job.complete;
});

const finishClerk = Effect.fn("Account.finishClerk")(function* (userId: string, hash: string) {
  const sql = yield* SqlClient.SqlClient;
  const clerk = yield* ClerkAdmin;

  yield* clerk.deleteUser(userId).pipe(Effect.retry({ times: 2 }));
  yield* sql`
    update account_deletions set clerk_deleted_at = now(), user_id = null
    where user_id_hash = ${hash}
  `;
});

/**
 * Deletes the account, in one transaction that also writes the fence. Its players in shared
 * groups become claimable guests and keep their rows; see `docs/internals/account-deletion.md`.
 * Clerk is asked afterwards, and a failure leaves the job pending for `retryClerkDeletions`. An
 * Apple code, when given, is revoked on the way and never changes the outcome.
 */
export const remove = Effect.fn("Account.remove")(function* (
  request: typeof DeleteAccountRequest.Type,
) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  const hash = yield* AccountFence.hashOf(userId);

  const finished = yield* Realtime.transaction(
    Effect.gen(function* () {
      yield* AccountFence.lockExclusive(userId);
      const done = yield* jobState(hash);

      if (done !== null) return done;
      yield* cleanup(userId);
      yield* sql`
        insert into account_deletions (user_id_hash, user_id, next_attempt_at)
        values (${hash}, ${userId}, now() + interval '10 minutes')
      `;

      return null;
    }),
  ).pipe(
    Effect.retry({ times: 2, while: (error) => Predicate.isTagged(error, "SuccessorGone") }),
    Effect.catchTag("SuccessorGone", Effect.die),
  );

  if (finished !== null) return { status: finished ? "complete" : "pending" } as const;

  if (request.authorizationCode !== undefined) {
    const apple = yield* AppleSignIn;

    yield* apple.revoke(request.authorizationCode).pipe(
      Effect.andThen(
        sql`update account_deletions set apple_revoked = true where user_id_hash = ${hash}`,
      ),
      Effect.catchTag("AppleRevokeFailed", (failed) =>
        Effect.logWarning("Apple revocation failed").pipe(
          Effect.annotateLogs({ step: failed.step }),
        ),
      ),
    );
  }

  return yield* finishClerk(userId, hash).pipe(
    Effect.as({ status: "complete" } as const),
    Effect.catchTag("ClerkUnavailable", (failed) =>
      Effect.logWarning("Clerk deletion is pending").pipe(
        Effect.annotateLogs({ status: failed.status }),
        Effect.as({ status: "pending" } as const),
      ),
    ),
  );
});

/**
 * Finishes the Clerk deletion of accounts whose request couldn't. Run on a schedule. A run takes
 * up to 25 due jobs with a lease, so overlapping runs take different ones, and a job that fails
 * waits longer each time, so it never keeps newer jobs from their turn.
 */
export const retryClerkDeletions = Effect.fn("Account.retryClerkDeletions")(function* () {
  const sql = yield* SqlClient.SqlClient;

  const jobs = yield* sql<{ userIdHash: string; userId: string }>`
    update account_deletions set next_attempt_at = now() + interval '10 minutes'
    where user_id_hash in (
      select user_id_hash from account_deletions
      where clerk_deleted_at is null and user_id is not null and next_attempt_at <= now()
      order by next_attempt_at, requested_at
      limit 25 for update skip locked
    )
    returning user_id_hash, user_id
  `;

  const results = yield* Effect.forEach(
    jobs,
    (job) =>
      finishClerk(job.userId, job.userIdHash).pipe(
        Effect.as(true),
        Effect.catchTag("ClerkUnavailable", () =>
          sql`
            update account_deletions
            set attempts = attempts + 1,
              next_attempt_at = now() + make_interval(mins => least(power(2, least(attempts, 9)), 360)::int)
            where user_id_hash = ${job.userIdHash}
          `.pipe(Effect.as(false)),
        ),
        Effect.catchCause((cause) =>
          Effect.logError("Retrying a Clerk deletion failed", cause).pipe(Effect.as(false)),
        ),
      ),
    { concurrency: 5 },
  );

  return { retried: jobs.length, completed: results.filter(Boolean).length };
});
