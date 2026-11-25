import { expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import {
  ActorId,
  CurrentUser,
  EntryId,
  Forbidden,
  groupScope,
  PlayerId,
  Recorder,
  RecorderOf,
  ScopeCloseCode,
  StakeId,
  TableId,
  tableScope,
  Unauthorized,
  UserId,
  type GroupId,
  type TripDetail,
  type TripId,
  type VisitId,
} from "@stacks/contracts";
import {
  RecordingCommand,
  RecordingOperationId,
  type RecordingIdentity,
} from "@stacks/contracts/recordingCommands";

import * as Clerk from "../auth/Clerk.ts";
import { clerkJwtKey, sessionToken } from "../testing/clerk.test-utils.ts";
import {
  catalogVenue,
  groupWith,
  ids,
  owe,
  usd,
  users,
  type TestGroup,
} from "../testing/fixtures.test-utils.ts";
import {
  finishHistoricalSession,
  seedEntry,
  seedSession,
  voidHistoricalEntry,
} from "../testing/legacySessions.test-utils.ts";
import {
  account,
  at,
  device,
  finish,
  recorderCommand,
  signedIn,
  sitDown,
  start,
  uuid,
} from "../testing/recording.test-utils.ts";
import { TableRow } from "../db/rows.ts";
import { TestApi } from "../testing/TestApi.test-utils.ts";
import type { Selector } from "../realtime/Selector.ts";
import * as Access from "./Access.ts";
import * as Account from "./Account.ts";
import * as AccountFence from "./AccountFence.ts";
import { DELETED_ACTOR } from "./AccountFence.ts";
import * as LegacyMigration from "./LegacyMigration.ts";
import * as Realtime from "./Realtime.ts";
import * as Recording from "./Recording.ts";

type Client = Effect.Success<ReturnType<TestApi["Service"]["as"]>>;

const identity = () => ({
  playerId: PlayerId.make(uuid()),
  actorId: ActorId.make(uuid()),
});

const push = (client: Client, who: RecordingIdentity, ...commands: Array<RecordingCommand>) =>
  client.recording
    .push({ payload: { identity: who, commands } })
    .pipe(Effect.map(({ results }) => results.map((result) => result.status)));

const toTrip = (who: RecordingIdentity, tableId: TableId, tripId: TripId | null) =>
  RecordingCommand.make({
    type: "set_table_trip",
    operationId: RecordingOperationId.make(uuid()),
    actorId: who.actorId,
    preparedAt: at(1),
    tableId,
    tripId,
  });

const finishAt = (who: RecordingIdentity, visitId: VisitId, minutes: number, amount: number) =>
  RecordingCommand.make({
    type: "finish",
    operationId: RecordingOperationId.make(uuid()),
    actorId: who.actorId,
    preparedAt: at(minutes),
    visitId,
    expectedRevision: 0,
    entryId: EntryId.make(uuid()),
    amount: usd(amount),
    finishedAt: at(minutes),
  });

const byId = (a: { readonly id: string }, b: { readonly id: string }) => a.id.localeCompare(b.id);

const standings = (detail: TripDetail) => ({
  tables: detail.tables
    .map((table) => ({
      id: table.table.id,
      playerIds: table.playerIds,
      playing: table.playing,
      results: table.results,
      inPlay: table.inPlay,
      others: table.others,
      endedAt: table.endedAt,
    }))
    .toSorted(byId),
  balances: detail.balances,
  stakes: detail.stakes.map(({ stake, result, owed }) => ({ id: stake.id, result, owed })),
  sessions: detail.sessions.map(({ session, results }) => ({ id: session.id, results })),
});

const userIdOf = (group: TestGroup, playerId: PlayerId) =>
  group.players.find((player) => player.id === playerId)!.userId!;

const writesStart = Effect.fn("test.writesStart")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const [row] = yield* sql<{ xid: number }>`select (txid_current() % 4294967296)::float8 as xid`;

  return row!.xid;
});

const mentions = Effect.fn("test.mentions")(function* (
  since: number,
  ...needles: ReadonlyArray<string>
) {
  const sql = yield* SqlClient.SqlClient;

  const tables = yield* sql<{ name: string }>`
    select table_name as name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  `;

  const found: Array<string> = [];

  for (const { name } of tables)
    for (const needle of needles) {
      const [row] = yield* sql<{ count: number }>`
        select count(*)::int as count from ${sql(name)} t
        where case when t.xmin::text::bigint >= ${since} then t::text like ${`%${needle}%`} end
      `;

      if (row!.count > 0) found.push(`${name}: ${needle}`);
    }

  return found;
});

const scene = Effect.fn("test.scene")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const api = yield* TestApi;
  const { alice, bob, carol } = yield* users("alice", "bob", "carol");
  const group = yield* groupWith(alice, bob);
  const alicePlayer = group.myPlayerId;
  const bobPlayer = group.players.find((player) => player.id !== alicePlayer)!.id;
  const aliceMe = identity();
  const bobMe = identity();
  const first = start(aliceMe);
  const aliceId = userIdOf(group, alicePlayer);

  yield* push(alice, aliceMe, first, toTrip(aliceMe, first.tableId, group.tripId));
  const { token } = yield* alice.recording.share({ params: { tableId: first.tableId } });

  const { player: bobAtTable } = yield* bob.recording.join({
    params: { token },
    payload: { identity: bobMe, player: { id: PlayerId.make(uuid()), displayName: "Bob" } },
  });

  const bobSits = sitDown(bobMe, first.tableId, bobAtTable.id, 5);
  const during = sitDown(aliceMe, first.tableId, aliceMe.playerId, 25);
  const after = sitDown(aliceMe, first.tableId, aliceMe.playerId, 35);

  yield* push(
    alice,
    aliceMe,
    recorderCommand("appoint_recorder", aliceMe, first.tableId, bobAtTable.id),
  );
  yield* push(bob, bobMe, bobSits, finishAt(bobMe, bobSits.visitId, 40, 18000));
  yield* push(alice, aliceMe, finishAt(aliceMe, first.visitId, 20, 25000));
  yield* push(alice, aliceMe, during, finishAt(aliceMe, during.visitId, 28, 3000));
  yield* push(alice, aliceMe, after);

  yield* sql`
    insert into membership_absences (group_id, user_id, left_at, returned_at)
    values (${group.group.id}, ${aliceId}, ${DateTime.toDateUtc(at(10))}, ${DateTime.toDateUtc(at(30))})
  `;

  const alone = start(aliceMe);
  yield* push(
    alice,
    aliceMe,
    alone,
    toTrip(aliceMe, alone.tableId, group.tripId),
    finish(aliceMe, alone.visitId),
  );

  const apart = start(aliceMe);
  yield* push(alice, aliceMe, apart);

  const solo = yield* groupWith(alice);
  const inSolo = start(aliceMe);
  yield* push(alice, aliceMe, inSolo, toTrip(aliceMe, inSolo.tableId, solo.tripId));

  const bobTable = start(bobMe);
  yield* push(bob, bobMe, bobTable);
  yield* sql`update tables set trip_id = ${solo.tripId} where id = ${bobTable.tableId}`;

  yield* owe(alice, group, bobPlayer, alicePlayer, 5000);
  const venue = yield* catalogVenue(alice);
  const sessionId = ids.session();
  yield* seedSession(group.tripId, {
    id: sessionId,
    venueId: venue.id,
    game: "blackjack",
    playerIds: [alicePlayer, bobPlayer],
    notes: null,
  });
  const voided = ids.entry();
  yield* seedEntry(sessionId, {
    id: voided,
    kind: "buy_in",
    playerId: alicePlayer,
    counterpartyId: null,
    amount: usd(7000),
    note: null,
    replacesEntryId: null,
  });
  yield* voidHistoricalEntry(voided, "Typo");
  yield* finishHistoricalSession(sessionId, {});
  yield* sql`
    insert into seatings (id, session_id, group_id, player_id, seat, occurred_at, created_by)
    values (${ids.seating()}, ${sessionId}, ${group.group.id}, ${alicePlayer}, 2, now(), ${aliceId})
  `;

  const side = yield* alice.trips.create({
    params: { groupId: group.group.id },
    payload: { id: ids.trip(), name: "Side trip" },
  });

  yield* alice.stakes.create({
    params: { tripId: side.id },
    payload: {
      id: StakeId.make(uuid()),
      lenderId: alicePlayer,
      borrowerId: bobPlayer,
      amount: usd(100000),
      lenderShare: 50,
      note: null,
    },
  });

  yield* alice.guests.add({
    params: { groupId: group.group.id },
    payload: { id: ids.player(), displayName: "Dave" },
  });

  return {
    api,
    alice,
    bob,
    carol,
    group,
    side,
    solo,
    alicePlayer,
    bobPlayer,
    aliceId,
    aliceMe,
    bobMe,
    first,
    after,
    alone,
    apart,
    inSolo,
    bobTable,
    token,
    bobAtTable,
  };
});

const standingsOf = (bob: Client, groupId: GroupId, tripId: TripId, sideId: TripId) =>
  Effect.gen(function* () {
    const stats = yield* bob.groups.stats({ params: { groupId } });

    return {
      trip: standings(yield* bob.trips.get({ params: { tripId } })),
      side: standings(yield* bob.trips.get({ params: { tripId: sideId } })),
      stats: stats.plays.map((play) => ({ id: play.id, results: play.results })).toSorted(byId),
      balance: (yield* bob.groups.list()).find((item) => item.group.id === groupId)!.myBalance,
    };
  });

it.layer(TestApi.layer)("deleting an account", (it) => {
  it.effect("keeps what friends recorded and makes the person a claimable guest", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const since = yield* writesStart();
      const s = yield* scene();
      const before = yield* standingsOf(s.bob, s.group.group.id, s.group.tripId, s.side.id);
      const owner = (yield* s.bob.groups.get({ params: { groupId: s.group.group.id } })).role;
      expect(owner).toBe("member");
      expect(before.trip.tables).toHaveLength(2);
      expect((yield* mentions(since, s.aliceId, s.aliceMe.actorId)).length).toBeGreaterThan(0);

      expect(yield* s.alice.account.delete({ payload: {} })).toEqual({ status: "complete" });

      expect(yield* standingsOf(s.bob, s.group.group.id, s.group.tripId, s.side.id)).toEqual(
        before,
      );
      expect(yield* mentions(since, s.aliceId, s.aliceMe.actorId)).toEqual([]);

      const detail = yield* s.bob.groups.get({ params: { groupId: s.group.group.id } });
      expect(detail.role).toBe("owner");
      const guest = detail.players.find((player) => player.id === s.alicePlayer)!;
      expect(guest).toMatchObject({ userId: null, role: null, displayName: "Owner" });
      expect(guest.claimCode).toMatch(/^[A-Z2-9]{10}$/);

      const [personal] = yield* sql<{
        userId: string | null;
        recordingActorId: string | null;
        createdBy: string | null;
      }>`select user_id, recording_actor_id, created_by from players where id = ${s.aliceMe.playerId}`;

      expect(personal).toEqual({
        userId: null,
        recordingActorId: null,
        createdBy: "deleted-account",
      });

      const [gone] = yield* sql<{ groups: number; tables: number; users: number }>`
        select
          (select count(*)::int from groups where id = ${s.solo.group.id}) as groups,
          (select count(*)::int from tables
            where id in (${s.apart.tableId}, ${s.inSolo.tableId})) as tables,
          (select count(*)::int from users where id = ${s.aliceId}) as users
      `;

      expect(gone).toEqual({ groups: 0, tables: 0, users: 0 });

      const [kept] = yield* sql<{ shared: number; detached: number; trip: string | null }>`
        select
          (select count(*)::int from tables where id = ${s.alone.tableId}) as shared,
          (select count(*)::int from tables where id = ${s.first.tableId}) as detached,
          (select trip_id from tables where id = ${s.bobTable.tableId}) as trip
      `;

      expect(kept).toEqual({ shared: 1, detached: 1, trip: null });

      const audit = yield* sql<{ createdBy: string }>`
        select distinct created_by from entries where group_id = ${s.group.group.id}
      `;

      expect(audit).toEqual([{ createdBy: "deleted-account" }]);
    }),
  );

  it.effect(
    "replays a native table's commands after the deletion, and lets the recorder go on",
    () =>
      Effect.gen(function* () {
        const s = yield* staleAccount();

        const { player } = yield* s.bob.join(s.token, {
          id: PlayerId.make(uuid()),
          displayName: "Bob again",
        });

        const sits = sitDown(s.bob.identity, s.opened.tableId, player.id, 5);
        const finishes = finishAt(s.bob.identity, sits.visitId, 40, 18000);
        expect(yield* s.bob.push(sits, finishes)).toEqual(["accepted", "accepted"]);

        const before = yield* s.bob.client.recording.table({
          params: { tableId: s.opened.tableId },
        });

        yield* s.alice.client.account.delete({ payload: {} });

        expect(yield* s.bob.push(sits, finishes)).toEqual(["accepted", "accepted"]);

        const after = yield* s.bob.client.recording.table({
          params: { tableId: s.opened.tableId },
        });

        expect(after.visits).toEqual(before.visits);

        const history = yield* s.bob.client.recording.history();
        const replayed = history.commands.map((command) => command.operationId);
        expect(replayed).toContain(sits.operationId);
        expect(yield* s.bob.push(sits)).toEqual(["accepted"]);
      }),
  );

  it.effect("lets the recorder go on recording, with the share link revoked", () =>
    Effect.gen(function* () {
      const s = yield* scene();
      yield* s.alice.account.delete({ payload: {} });

      const anonymous = yield* (yield* TestApi).asActor(null);

      const link = yield* Effect.flip(
        anonymous.publicRecording.shared({ params: { token: s.token } }),
      );

      expect(link._tag).toBe("NotFound");

      const view = yield* s.bob.recording.table({ params: { tableId: s.first.tableId } });
      expect(view.viewerRole).toBe("recorder");
      expect(view.recorders).toEqual([s.bobAtTable.id]);

      expect(yield* push(s.bob, s.bobMe, finishAt(s.bobMe, s.after.visitId, 50, 9000))).toEqual([
        "accepted",
      ]);

      const history = yield* s.bob.recording.history();
      const actors = new Set(history.commands.map((command) => command.actorId));
      expect(actors.has(s.aliceMe.actorId)).toBe(false);
      expect(actors.has(ActorId.make(DELETED_ACTOR))).toBe(true);
    }),
  );

  it.effect("lets a new account claim the guest with the same history", () =>
    Effect.gen(function* () {
      const s = yield* scene();
      const before = yield* s.bob.trips.get({ params: { tripId: s.group.tripId } });
      yield* s.alice.account.delete({ payload: {} });

      const { players } = yield* s.bob.groups.get({ params: { groupId: s.group.group.id } });
      const code = players.find((player) => player.id === s.alicePlayer)!.claimCode!;

      const claimed = yield* s.carol.guests.claim({ params: { code } });
      expect(claimed.myPlayerId).toBe(s.alicePlayer);

      const after = yield* s.carol.trips.get({ params: { tripId: s.group.tripId } });
      expect(standings(after)).toEqual(standings(before));
    }),
  );

  it.effect("refuses what the deleted account signed, and never brings it back", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const s = yield* scene();
      yield* s.alice.account.delete({ payload: {} });

      expect((yield* Effect.flip(s.alice.groups.list()))._tag).toBe("Unauthorized");
      expect((yield* Effect.flip(s.alice.recording.history()))._tag).toBe("Unauthorized");
      expect(yield* s.alice.account.delete({ payload: {} })).toEqual({ status: "complete" });

      const upgrade = yield* s.api.upgrade(`group:${s.group.group.id}`, {
        token: s.aliceId,
      });

      expect(upgrade.status).toBe(401);

      const recreated = yield* Effect.flip(
        Access.ensureUser().pipe(
          Effect.provideService(CurrentUser, {
            userId: UserId.make(s.aliceId),
            displayName: "Alice",
            avatarUrl: null,
          }),
        ),
      );

      expect(recreated._tag).toBe("Unauthorized");

      const [row] = yield* sql<{ count: number }>`
        select count(*)::int as count from users where id = ${s.aliceId}
      `;

      expect(row!.count).toBe(0);
    }),
  );

  it.effect("turns away a deleted account's Clerk session through the real verification", () =>
    Effect.gen(function* () {
      const s = yield* scene();

      const verify = yield* Clerk.makeVerify.pipe(
        Effect.provide(
          ConfigProvider.layer(ConfigProvider.fromUnknown({ CLERK_JWT_KEY: clerkJwtKey })),
        ),
      );

      const scope = `group:${s.group.group.id}`;
      const token = sessionToken(s.aliceId, 300);
      expect((yield* s.api.upgrade(scope, { token }, verify)).status).toBe(200);

      yield* s.alice.account.delete({ payload: {} });

      expect((yield* s.api.upgrade(scope, { token }, verify)).status).toBe(401);
      expect(
        (yield* s.api.upgrade(scope, { token: sessionToken(s.aliceId, 300) }, verify)).status,
      ).toBe(401);
    }),
  );

  it.effect("passes ownership to the longest-standing admin before any member", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { alice, bea, cal, dee } = yield* users("alice", "bea", "cal", "dee");
      const group = yield* groupWith(alice, bea, cal, dee);
      const [bea1, cal1, dee1] = group.players.filter((player) => player.id !== group.myPlayerId);

      yield* alice.groups.setRole({
        params: { groupId: group.group.id, userId: dee1!.userId! },
        payload: { role: "admin" },
      });
      yield* sql`
        update memberships set joined_at = case user_id
          when ${bea1!.userId!} then now() - interval '3 days'
          when ${dee1!.userId!} then now() - interval '1 days'
          else now() - interval '2 days' end
        where group_id = ${group.group.id} and user_id <> ${userIdOf(group, group.myPlayerId)}
      `;

      const preview = yield* alice.account.deletionPreview();
      expect(preview.ownershipMoves).toEqual([
        {
          group: { id: group.group.id, name: "Vegas crew" },
          newOwner: { playerId: dee1!.id, displayName: dee1!.displayName },
        },
      ]);

      yield* alice.account.delete({ payload: {} });

      const roles = yield* sql<{ userId: string; role: string }>`
        select user_id, role from memberships where group_id = ${group.group.id}
      `;

      expect(Object.fromEntries(roles.map((row) => [row.userId, row.role]))).toEqual({
        [bea1!.userId!]: "member",
        [cal1!.userId!]: "member",
        [dee1!.userId!]: "owner",
      });
    }),
  );

  it.effect("passes ownership to the longest-standing member when no one else is an admin", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { alice, bea, cal } = yield* users("alice", "bea", "cal");
      const group = yield* groupWith(alice, bea, cal);
      const [bea1, cal1] = group.players.filter((player) => player.id !== group.myPlayerId);

      yield* sql`
        update memberships set joined_at = case user_id
          when ${bea1!.userId!} then now() - interval '1 days'
          else now() - interval '4 days' end
        where group_id = ${group.group.id} and user_id <> ${userIdOf(group, group.myPlayerId)}
      `;

      yield* alice.account.delete({ payload: {} });

      const [owner] = yield* sql<{ userId: string }>`
        select user_id from memberships where group_id = ${group.group.id} and role = 'owner'
      `;

      expect(owner!.userId).toBe(cal1!.userId);
    }),
  );
});

const deleting = (userId: string) =>
  Account.remove({ authorizationCode: "apple-code" }).pipe(
    Effect.provideService(CurrentUser, {
      userId: UserId.make(userId),
      displayName: "Someone",
      avatarUrl: null,
    }),
    Effect.provideService(Realtime.Realtime, Realtime.makeRealtime()),
  );

const attemptsFor = (api: TestApi["Service"], userId: string) =>
  api.outside.clerkAttempts.get(userId) ?? 0;

const dueNow = Effect.fn("test.dueNow")(function* (userId: string) {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    update account_deletions set next_attempt_at = '-infinity'
    where user_id_hash = ${yield* AccountFence.hashOf(userId)}
  `;
});

const jobOf = Effect.fn("test.jobOf")(function* (userId: string) {
  const sql = yield* SqlClient.SqlClient;

  const [job] = yield* sql<{
    userId: string | null;
    clerkDeleted: boolean;
    appleRevoked: boolean;
  }>`
    select user_id, clerk_deleted_at is not null as clerk_deleted, apple_revoked
    from account_deletions where user_id_hash = ${yield* AccountFence.hashOf(userId)}
  `;

  return job;
});

it.layer(TestApi.layer)("what deleting an account shows and tells", (it) => {
  it.effect("previews the solo groups, ownership moves, open balances, stakes and Apple", () =>
    Effect.gen(function* () {
      const s = yield* scene();

      const before = (yield* s.alice.groups.list()).find(
        (item) => item.group.id === s.group.group.id,
      )!;

      const preview = yield* s.alice.account.deletionPreview();
      expect(preview.soloGroups).toEqual([{ id: s.solo.group.id, name: "Vegas crew" }]);
      expect(preview.ownershipMoves).toEqual([
        {
          group: { id: s.group.group.id, name: "Vegas crew" },
          newOwner: { playerId: s.bobPlayer, displayName: "Member 1" },
        },
      ]);
      expect(preview.openBalances).toEqual([
        {
          group: { id: s.group.group.id, name: "Vegas crew" },
          currency: "USD",
          amount: before.myBalance,
        },
      ]);
      expect(before.myBalance).toBeGreaterThan(0);
      expect(preview.openStakes).toEqual([
        { group: { id: s.group.group.id, name: "Vegas crew" }, count: 1 },
      ]);
      expect(preview.appleLinked).toBe(false);

      s.api.outside.appleLinked.add(s.aliceId);
      expect((yield* s.alice.account.deletionPreview()).appleLinked).toBe(true);
      expect((yield* s.bob.account.deletionPreview()).soloGroups).toEqual([]);
    }),
  );

  it.effect("tells the groups and tables that stay, and closes what the account held open", () =>
    Effect.gen(function* () {
      const s = yield* scene();
      let closing: ReadonlyArray<unknown> = [];

      const notices = yield* s.api.notified(
        s.api
          .closes(s.alice.account.delete({ payload: {} }))
          .pipe(Effect.tap((closes) => Effect.sync(() => void (closing = closes)))),
      );

      expect(notices).toEqual(
        expect.arrayContaining([groupScope(s.group.group.id), tableScope(s.first.tableId)]),
      );

      const closeOf = (
        scope: string,
        selector: Selector,
        code: Realtime.Close["code"] = ScopeCloseCode.revoked,
      ) => ({
        scope,
        selector,
        code,
      });

      expect(closing).toEqual(
        expect.arrayContaining([
          closeOf(groupScope(s.group.group.id), { kind: "user", userId: s.aliceId }),
          closeOf(groupScope(s.solo.group.id), { kind: "all" }),
          closeOf(tableScope(s.first.tableId), { kind: "actor", actorId: s.aliceMe.actorId }),
          closeOf(tableScope(s.first.tableId), {
            kind: "share",
            shareHash: yield* Recording.digest(s.token),
          }),
          closeOf(tableScope(s.apart.tableId), { kind: "all" }, ScopeCloseCode.tableDeleted),
        ]),
      );
    }),
  );
});

it.layer(TestApi.layer)("finishing a deletion", (it) => {
  it.effect("reports pending when Clerk is down, and the retry finishes it", () =>
    Effect.gen(function* () {
      const s = yield* scene();

      expect(yield* s.api.whileClerkDown(s.alice.account.delete({ payload: {} }))).toEqual({
        status: "pending",
      });
      expect(attemptsFor(s.api, s.aliceId)).toBe(3);
      expect(yield* jobOf(s.aliceId)).toEqual({
        userId: s.aliceId,
        clerkDeleted: false,
        appleRevoked: false,
      });
      expect((yield* Effect.flip(s.alice.groups.list()))._tag).toBe("Unauthorized");

      yield* dueNow(s.aliceId);
      yield* s.api.whileClerkDown(s.api.retryClerkDeletions);
      expect(attemptsFor(s.api, s.aliceId)).toBe(6);
      expect((yield* jobOf(s.aliceId))?.clerkDeleted).toBe(false);
      expect(s.api.outside.clerkDeleted).not.toContain(s.aliceId);

      yield* dueNow(s.aliceId);
      yield* s.api.retryClerkDeletions;
      expect(yield* jobOf(s.aliceId)).toEqual({
        userId: null,
        clerkDeleted: true,
        appleRevoked: false,
      });
      expect(s.api.outside.clerkDeleted).toContain(s.aliceId);

      const done = attemptsFor(s.api, s.aliceId);
      yield* s.api.retryClerkDeletions;
      expect(attemptsFor(s.api, s.aliceId)).toBe(done);
    }),
  );

  it.effect("returns the job's state to a duplicate request, and cleans up once", () =>
    Effect.gen(function* () {
      const s = yield* scene();

      const first = yield* s.api.withOutside(deleting(s.aliceId));
      const second = yield* s.api.withOutside(deleting(s.aliceId));

      expect([first, second]).toEqual([{ status: "complete" }, { status: "complete" }]);
      expect(attemptsFor(s.api, s.aliceId)).toBe(1);
      expect(s.api.outside.appleRevoked.filter((code) => code === "apple-code")).toHaveLength(1);
    }),
  );

  it.effect("keeps a lost response pending until the retry, without asking Clerk again", () =>
    Effect.gen(function* () {
      const s = yield* scene();

      expect(yield* s.api.whileClerkDown(s.api.withOutside(deleting(s.aliceId)))).toEqual({
        status: "pending",
      });
      const asked = attemptsFor(s.api, s.aliceId);
      expect(yield* s.api.withOutside(deleting(s.aliceId))).toEqual({ status: "pending" });
      expect(attemptsFor(s.api, s.aliceId)).toBe(asked);
    }),
  );

  it.effect("revokes the Apple code, and carries on when Apple fails", () =>
    Effect.gen(function* () {
      const revoked = yield* scene();

      expect(
        yield* revoked.alice.account.delete({ payload: { authorizationCode: "good" } }),
      ).toEqual({ status: "complete" });
      expect(revoked.api.outside.appleRevoked).toContain("good");
      expect((yield* jobOf(revoked.aliceId))?.appleRevoked).toBe(true);

      const refused = yield* scene();

      expect(
        yield* refused.api.whileAppleDown(
          refused.alice.account.delete({ payload: { authorizationCode: "bad" } }),
        ),
      ).toEqual({ status: "complete" });
      expect(refused.api.outside.appleRevoked).not.toContain("bad");
      expect(yield* jobOf(refused.aliceId)).toEqual({
        userId: null,
        clerkDeleted: true,
        appleRevoked: false,
      });
    }),
  );
});

const legacyScene = Effect.fn("test.legacyScene")(function* (
  alice: Client,
  group: TestGroup,
  bobPlayer: PlayerId,
) {
  const venue = yield* catalogVenue(alice);
  const sessionId = ids.session();
  yield* seedSession(group.tripId, {
    id: sessionId,
    venueId: venue.id,
    game: "blackjack",
    playerIds: [group.myPlayerId, bobPlayer],
    notes: null,
  });

  const entry = (kind: "buy_in" | "cash_out", playerId: PlayerId, amount: number) =>
    seedEntry(sessionId, {
      id: ids.entry(),
      kind,
      playerId,
      counterpartyId: null,
      amount: usd(amount),
      note: null,
      replacesEntryId: null,
    });

  yield* entry("buy_in", group.myPlayerId, 10000);
  const mistake = yield* entry("buy_in", bobPlayer, 5000);
  yield* seedEntry(sessionId, {
    id: ids.entry(),
    kind: "buy_in",
    playerId: bobPlayer,
    counterpartyId: null,
    amount: usd(6000),
    note: null,
    replacesEntryId: mistake.id,
  });
  yield* entry("cash_out", group.myPlayerId, 4000);
  yield* entry("cash_out", bobPlayer, 14000);
  yield* finishHistoricalSession(sessionId);

  return sessionId;
});

const tableEntries = (view: {
  readonly entries?: ReadonlyArray<{ readonly id: string }> | undefined;
}) => (view.entries ?? []).map(({ id }) => id).toSorted();

it.layer(TestApi.layer)("deleting an account with legacy history", (it) => {
  it.effect("keeps an imported table, and importing it again changes nothing", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { alice, bob } = yield* users("alice", "bob");
      const group = yield* groupWith(alice, bob);
      const bobPlayer = group.players.find((player) => player.id !== group.myPlayerId)!.id;
      const second = yield* groupWith(alice, bob);
      const secondBob = second.players.find((player) => player.id !== second.myPlayerId)!.id;
      const imported = yield* legacyScene(alice, group, bobPlayer);
      const later = yield* legacyScene(alice, second, secondBob);

      const report = yield* LegacyMigration.importLegacy({
        scope: [group.group.id],
        dryRun: false,
      });

      expect(report).toMatchObject({ tables: 1, visits: 2, entries: 5 });

      const params = { tableId: TableId.make(imported) };
      const before = yield* bob.recording.table({ params });
      expect(before.entries).toHaveLength(5);

      yield* alice.account.delete({ payload: {} });

      const after = yield* bob.recording.table({ params });
      expect(tableEntries(after)).toEqual(tableEntries(before));
      expect(after.visits).toEqual(before.visits);

      expect(
        yield* LegacyMigration.importLegacy({ scope: [group.group.id], dryRun: false }),
      ).toEqual({ dryRun: false, identities: 0, tables: 0, visits: 0, entries: 0 });

      const fresh = yield* LegacyMigration.importLegacy({
        scope: [second.group.id],
        dryRun: false,
      });

      expect(fresh).toMatchObject({ identities: 0, tables: 1, visits: 2, entries: 5 });
      expect(
        tableEntries(yield* bob.recording.table({ params: { tableId: TableId.make(later) } })),
      ).toHaveLength(5);

      const [audit] = yield* sql<{ count: number }>`
        select count(*)::int as count from players where user_id = 'deleted-account'
      `;

      expect(audit!.count).toBe(0);
    }),
  );

  it.effect("removes a solo group's imported tables along with it", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { alice } = yield* users("alice");
      const group = yield* groupWith(alice);
      const guestId = ids.player();

      yield* alice.guests.add({
        params: { groupId: group.group.id },
        payload: { id: guestId, displayName: "Gus" },
      });
      const imported = yield* legacyScene(alice, group, guestId);
      yield* LegacyMigration.importLegacy({ scope: [group.group.id], dryRun: false });

      yield* alice.account.delete({ payload: {} });

      const [rows] = yield* sql<{ tables: number; visits: number; groups: number }>`
        select (select count(*)::int from tables where id = ${imported}) as tables,
          (select count(*)::int from personal_visits where table_id = ${imported}) as visits,
          (select count(*)::int from groups where id = ${group.group.id}) as groups
      `;

      expect(rows).toEqual({ tables: 0, visits: 0, groups: 0 });
    }),
  );
});

const groupsHolding = Effect.fn("test.groupsHolding")(function* (
  ...groupIds: ReadonlyArray<GroupId>
) {
  const sql = yield* SqlClient.SqlClient;

  return yield* sql<{ id: string }>`select id from groups where id in ${sql.in(groupIds)}`;
});

it.layer(TestApi.layer)("whose records a group holds", (it) => {
  it.effect("keeps a group a former member played in, even with no one left to inherit it", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { alice, bob } = yield* users("alice", "bob");
      const group = yield* groupWith(alice, bob);
      const bobPlayer = group.players.find((player) => player.id !== group.myPlayerId)!.id;
      yield* owe(alice, group, bobPlayer, group.myPlayerId, 4000);
      yield* bob.groups.leave({ params: { groupId: group.group.id } });

      expect((yield* alice.account.deletionPreview()).soloGroups).toEqual([]);
      yield* alice.account.delete({ payload: {} });

      expect(yield* groupsHolding(group.group.id)).toHaveLength(1);

      const [rows] = yield* sql<{ entries: number; guests: number; owners: number }>`
        select (select count(*)::int from entries where group_id = ${group.group.id}) as entries,
          (select count(*)::int from players
            where group_id = ${group.group.id} and user_id is null and claim_code is not null) as guests,
          (select count(*)::int from memberships
            where group_id = ${group.group.id} and role = 'owner' and left_at is null) as owners
      `;

      expect(rows).toEqual({ entries: 1, guests: 1, owners: 0 });
    }),
  );

  it.effect("deletes a private group the account had already left", () =>
    Effect.gen(function* () {
      const { alice } = yield* users("alice");
      const group = yield* groupWith(alice);
      yield* alice.groups.leave({ params: { groupId: group.group.id } });

      yield* alice.account.delete({ payload: {} });

      expect(yield* groupsHolding(group.group.id)).toEqual([]);
    }),
  );

  it.effect("leaves exactly one owner when the owner and the successor delete together", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const trios = yield* Effect.forEach([1, 2, 3, 4, 5, 6], () =>
        Effect.gen(function* () {
          const { alice, bob, carol } = yield* users("alice", "bob", "carol");
          const group = yield* groupWith(alice, bob, carol);

          const [bobPlayer, carolPlayer] = group.players.filter(
            (player) => player.id !== group.myPlayerId,
          );

          yield* alice.groups.setRole({
            params: { groupId: group.group.id, userId: bobPlayer!.userId! },
            payload: { role: "admin" },
          });

          return { alice, bob, groupId: group.group.id, carolId: carolPlayer!.userId! };
        }),
      );

      yield* Effect.forEach(
        trios,
        (trio) =>
          Effect.all(
            [trio.alice.account.delete({ payload: {} }), trio.bob.account.delete({ payload: {} })],
            {
              concurrency: "unbounded",
            },
          ),
        { concurrency: "unbounded" },
      );

      for (const trio of trios) {
        const owners = yield* sql<{ userId: string }>`
          select user_id from memberships where group_id = ${trio.groupId} and role = 'owner'
        `;

        expect(owners).toEqual([{ userId: trio.carolId }]);
      }
    }),
  );
});

it.layer(TestApi.layer)("the reserved audit actor", (it) => {
  it.effect("can never be recorded as, registered, bound or removed", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const api = yield* TestApi;
      const reserved = ActorId.make(DELETED_ACTOR);

      const impostor = yield* signedIn(`impostor_${uuid().slice(0, 8)}`, {
        playerId: PlayerId.make(uuid()),
        actorId: reserved,
      });

      const establishing = yield* Effect.flip(impostor.push(start(impostor.identity)));
      expect(establishing).toMatchObject({ reason: "recording_identity" });

      const anonymous = yield* api.asActor(null);

      const registering = yield* Effect.flip(
        anonymous.publicRecording.registerActor({
          payload: { actorId: reserved, secret: "0".repeat(64) },
        }),
      );

      expect(registering).toMatchObject({ reason: "actor_taken" });

      const player = PlayerId.make(uuid());
      yield* sql`insert into players (id, display_name, created_by_actor) values (${player}, 'P', ${uuid()})`;
      const binding = sql`insert into player_actors (player_id, actor_id) values (${player}, ${DELETED_ACTOR})`;
      expect((yield* Effect.flip(binding))._tag).toBe("SqlError");

      const removing = sql`delete from recording_actors where id = ${DELETED_ACTOR}`;
      expect((yield* Effect.flip(removing))._tag).toBe("SqlError");

      const [row] = yield* sql<{
        kind: string;
      }>`select kind from recording_actors where id = ${DELETED_ACTOR}`;

      expect(row).toEqual({ kind: "audit" });
    }),
  );

  it.effect("rejects a table player with no owner at all", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const bare = sql`
        insert into players (id, group_id, display_name, user_id, created_by, created_by_actor,
          recording_actor_id)
        values (${uuid()}, null, 'Nobody', null, null, null, null)
      `;

      expect((yield* Effect.flip(bare))._tag).toBe("SqlError");
    }),
  );
});

const linkedPhone = Effect.fn("test.linkedPhone")(function* (
  alice: Effect.Success<ReturnType<typeof account>>,
) {
  const phone = yield* device();
  const table = start(phone.identity);
  expect(yield* phone.push(table)).toEqual(["accepted"]);
  const { token } = yield* phone.client.recording.share({ params: { tableId: table.tableId } });
  const friend = yield* account("friend");
  yield* friend.join(token);

  yield* alice.client.claim.claimActor({
    payload: {
      actorId: phone.credential.actorId,
      secret: phone.credential.secret,
      link: true,
    },
  });

  return { phone, table };
});

const staleAccount = Effect.fn("test.staleAccount")(function* () {
  const api = yield* TestApi;
  const alice = yield* account("alice");

  const user = {
    userId: UserId.make(`user_${alice.handle}`),
    displayName: "Alice",
    avatarUrl: null,
  };

  const opened = start(alice.identity);
  expect(yield* alice.push(opened)).toEqual(["accepted"]);
  const { token } = yield* alice.client.recording.share({ params: { tableId: opened.tableId } });
  const bob = yield* account("bob");
  yield* bob.join(token);
  const asAccount = RecorderOf.Account({ user });

  const established = yield* Recording.establish(alice.identity).pipe(
    Effect.provideService(Recorder, asAccount),
  );

  return { api, alice, bob, user, opened, token, asAccount, established };
});

it.layer(TestApi.layer)("writes in flight when an account is deleted", (it) => {
  it.effect("refuses commands from a recorder resolved before the deletion", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const s = yield* staleAccount();
      yield* s.alice.client.account.delete({ payload: {} });

      const later = start(s.alice.identity);

      const pushing = yield* Effect.flip(
        Recording.pushEstablished(s.established, [later]).pipe(
          Effect.provideService(Recorder, s.asAccount),
          Effect.provideService(Realtime.Realtime, Realtime.makeRealtime()),
        ),
      );

      expect(pushing._tag).toBe("Unauthorized");

      const [rows] = yield* sql<{ tables: number; operations: number }>`
        select (select count(*)::int from tables where id = ${later.tableId}) as tables,
          (select count(*)::int from personal_operations
            where actor_id = ${s.alice.identity.actorId}) as operations
      `;

      expect(rows).toEqual({ tables: 0, operations: 0 });
    }),
  );

  it.effect("refuses a linked device whose binding the deletion removed", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const s = yield* staleAccount();
      const { phone, table } = yield* linkedPhone(s.alice);

      const asDevice = RecorderOf.Actor({
        actorId: phone.credential.actorId,
        secret: phone.credential.secret,
      });

      const established = yield* Recording.establish(phone.identity).pipe(
        Effect.provideService(Recorder, asDevice),
      );

      expect(established.actorPlayers).toContain(phone.identity.playerId);
      yield* s.alice.client.account.delete({ payload: {} });

      const results = yield* Recording.pushEstablished(established, [
        finishAt(phone.identity, table.visitId, 50, 100),
      ]).pipe(
        Effect.provideService(Recorder, asDevice),
        Effect.provideService(Realtime.Realtime, Realtime.makeRealtime()),
      );

      expect(results.results.map((result) => result.status)).toEqual(["rejected"]);

      const [row] = yield* sql<{ finishedAt: Date | null }>`
        select finished_at from personal_visits where id = ${table.visitId}
      `;

      expect(row!.finishedAt).toBeNull();
    }),
  );

  it.effect("cannot restore a share link the deletion revoked", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const s = yield* staleAccount();

      const [table] = yield* sql`select * from tables where id = ${s.opened.tableId}`.pipe(
        Effect.flatMap(Access.decodeRows(TableRow)),
      );

      yield* s.alice.client.account.delete({ payload: {} });

      const restoring = yield* Effect.exit(
        Recording.shareRow({ ...table!, starterPlayerId: table!.starterPlayerId! }).pipe(
          Effect.provideService(Recorder, s.asAccount),
          Effect.provideService(Realtime.Realtime, Realtime.makeRealtime()),
        ),
      );

      expect(restoring._tag).toBe("Failure");

      const [row] = yield* sql<{ shareTokenHash: string | null }>`
        select share_token_hash from tables where id = ${s.opened.tableId}
      `;

      expect(row!.shareTokenHash).toBeNull();
    }),
  );
});

it.layer(TestApi.layer)("what a deletion reaches on other devices", (it) => {
  it.effect("closes the table sockets of every device linked to the account's players", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const s = yield* staleAccount();
      const { phone, table } = yield* linkedPhone(s.alice);

      const closes = yield* api.closes(s.alice.client.account.delete({ payload: {} }));

      expect(closes).toEqual(
        expect.arrayContaining([
          {
            scope: tableScope(table.tableId),
            selector: { kind: "actor", actorId: phone.identity.actorId },
            code: ScopeCloseCode.revoked,
          },
          {
            scope: tableScope(s.opened.tableId),
            selector: { kind: "actor", actorId: s.alice.identity.actorId },
            code: ScopeCloseCode.revoked,
          },
        ]),
      );
    }),
  );

  it.effect("rewrites only the actor field of a command, never a note that holds the same id", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const s = yield* staleAccount();
      const note = s.alice.identity.actorId;

      const withNote = RecordingCommand.make({
        type: "add",
        operationId: RecordingOperationId.make(uuid()),
        actorId: s.alice.identity.actorId,
        preparedAt: at(10),
        visitId: s.opened.visitId,
        expectedRevision: 0,
        entryId: EntryId.make(uuid()),
        kind: "buy_in",
        amount: usd(5000),
        occurredAt: at(10),
        note,
      });

      expect(yield* s.alice.push(withNote)).toEqual(["accepted"]);

      yield* s.alice.client.account.delete({ payload: {} });

      const [command] = yield* sql<{ actorId: string; note: string }>`
        select command ->> 'actorId' as actor_id, command ->> 'note' as note
        from personal_operations where id = ${withNote.operationId}
      `;

      expect(command).toEqual({ actorId: DELETED_ACTOR, note });
    }),
  );
});

it.layer(TestApi.layer)("asking again after a deletion", (it) => {
  it.effect("answers a repeated request over HTTP with the job's state, and nothing else", () =>
    Effect.gen(function* () {
      const s = yield* scene();

      expect(yield* s.api.whileClerkDown(s.alice.account.delete({ payload: {} }))).toEqual({
        status: "pending",
      });
      expect(yield* s.alice.account.delete({ payload: {} })).toEqual({ status: "pending" });
      expect((yield* Effect.flip(s.alice.account.deletionPreview()))._tag).toBe("Unauthorized");

      yield* dueNow(s.aliceId);
      yield* s.api.retryClerkDeletions;
      expect(yield* s.alice.account.delete({ payload: {} })).toEqual({ status: "complete" });
      expect((yield* Effect.flip(s.alice.groups.list()))._tag).toBe("Unauthorized");
    }),
  );
});

const clearDueJobs = Effect.fn("test.clearDueJobs")(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    update account_deletions set next_attempt_at = now() + interval '1 hour'
    where clerk_deleted_at is null and next_attempt_at <= now()
  `;
});

const stuckJob = Effect.fn("test.stuckJob")(function* (userId: string, order: number) {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    insert into account_deletions (user_id_hash, user_id, requested_at, next_attempt_at)
    values (${yield* AccountFence.hashOf(userId)}, ${userId},
      timestamptz '2000-01-01T00:00:00Z' + ${order} * interval '1 minute',
      timestamptz '2000-01-01T00:00:00Z' + ${order} * interval '1 minute')
  `;
});

it.layer(TestApi.layer)("retrying Clerk deletions", (it) => {
  it.effect("moves past jobs that keep failing, so a healthy one behind them finishes", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      yield* clearDueJobs();
      const run = uuid().slice(0, 8);
      const failing = Array.from({ length: 26 }, (_, index) => `user_stuck_${run}_${index}`);
      const healthy = `user_healthy_${run}`;

      for (const [index, userId] of failing.entries()) {
        api.outside.clerkFailing.add(userId);
        yield* stuckJob(userId, index);
      }

      yield* stuckJob(healthy, 100);

      yield* api.retryClerkDeletions;
      expect(api.outside.clerkDeleted).not.toContain(healthy);

      yield* api.retryClerkDeletions;
      expect(api.outside.clerkDeleted).toContain(healthy);
      expect(yield* jobOf(healthy)).toMatchObject({ clerkDeleted: true });
      expect((yield* jobOf(failing[0]!))?.clerkDeleted).toBe(false);
    }),
  );

  it.effect("lets two overlapping runs each take different jobs, once", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      yield* clearDueJobs();
      const run = uuid().slice(0, 8);
      const users = Array.from({ length: 8 }, (_, index) => `user_overlap_${run}_${index}`);

      for (const [index, userId] of users.entries()) yield* stuckJob(userId, 200 + index);

      yield* Effect.all([api.retryClerkDeletions, api.retryClerkDeletions], {
        concurrency: "unbounded",
      });

      for (const userId of users) {
        expect(api.outside.clerkDeleted.filter((deleted) => deleted === userId)).toHaveLength(1);
        expect(yield* jobOf(userId)).toMatchObject({ clerkDeleted: true });
      }
    }),
  );
});

const activeOwners = Effect.fn("test.activeOwners")(function* (groupId: GroupId) {
  const sql = yield* SqlClient.SqlClient;

  const rows = yield* sql<{ userId: string }>`
    select user_id from memberships
    where group_id = ${groupId} and role = 'owner' and left_at is null
  `;

  return rows.map((row) => row.userId);
});

it.layer(TestApi.layer)("membership changes decided under the group lock", (it) => {
  it.effect("leaves an owner when the successor leaves as the owner is deleted", () =>
    Effect.gen(function* () {
      const trios = yield* Effect.forEach([1, 2, 3, 4, 5, 6], () =>
        Effect.gen(function* () {
          const { alice, bob, carol } = yield* users("alice", "bob", "carol");
          const group = yield* groupWith(alice, bob, carol);
          const bobPlayer = group.players.find((player) => player.id !== group.myPlayerId)!;

          yield* alice.groups.setRole({
            params: { groupId: group.group.id, userId: bobPlayer.userId! },
            payload: { role: "admin" },
          });

          return { alice, bob, carol, groupId: group.group.id };
        }),
      );

      yield* Effect.forEach(
        trios,
        (each) =>
          Effect.all(
            [
              each.alice.account.delete({ payload: {} }),
              Effect.exit(each.bob.groups.leave({ params: { groupId: each.groupId } })),
            ],
            { concurrency: "unbounded" },
          ),
        { concurrency: "unbounded" },
      );

      for (const each of trios) expect(yield* activeOwners(each.groupId)).toHaveLength(1);
    }),
  );

  it.effect("refuses to change the role of an owner", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { alice, bob } = yield* users("alice", "bob");
      const group = yield* groupWith(alice, bob);
      const bobPlayer = group.players.find((player) => player.id !== group.myPlayerId)!;
      yield* sql`
        update memberships set role = 'owner'
        where group_id = ${group.group.id} and user_id = ${bobPlayer.userId!}
      `;

      const demoting = yield* Effect.flip(
        alice.groups.setRole({
          params: { groupId: group.group.id, userId: bobPlayer.userId! },
          payload: { role: "member" },
        }),
      );

      expect(demoting).toBeInstanceOf(Forbidden);
      expect(demoting).toMatchObject({ reason: "owner_only" });
      expect(yield* activeOwners(group.group.id)).toHaveLength(2);
    }),
  );
});

it.layer(TestApi.layer)("rejoining a group", (it) => {
  it.effect("makes a former member who rejoins through an open invite the owner", () =>
    Effect.gen(function* () {
      const { alice, bob } = yield* users("alice", "bob");
      const group = yield* groupWith(alice, bob);
      const bobPlayer = group.players.find((player) => player.id !== group.myPlayerId)!;

      yield* alice.groups.setRole({
        params: { groupId: group.group.id, userId: bobPlayer.userId! },
        payload: { role: "admin" },
      });

      const invite = yield* bob.invites.create({
        params: { groupId: group.group.id },
        payload: { id: ids.invite(), maxUses: null },
      });

      yield* bob.groups.leave({ params: { groupId: group.group.id } });
      yield* alice.account.delete({ payload: {} });
      expect(yield* activeOwners(group.group.id)).toEqual([]);

      const rejoined = yield* bob.invites.accept({
        params: { code: invite.code },
        payload: { displayName: "Bob" },
      });

      expect(rejoined.role).toBe("owner");
      expect(yield* activeOwners(group.group.id)).toEqual([bobPlayer.userId]);
    }),
  );

  it.effect("makes the first person to claim a guest the owner, and only the first", () =>
    Effect.gen(function* () {
      const { alice, carol, dee } = yield* users("alice", "carol", "dee");
      const group = yield* groupWith(alice);
      const gusId = ids.player();
      const boId = ids.player();

      yield* alice.guests.add({
        params: { groupId: group.group.id },
        payload: { id: gusId, displayName: "Gus" },
      });

      const detail = yield* alice.guests.add({
        params: { groupId: group.group.id },
        payload: { id: boId, displayName: "Bo" },
      });

      const invite = yield* alice.invites.create({
        params: { groupId: group.group.id },
        payload: { id: ids.invite(), maxUses: null },
      });

      yield* carol.invites.accept({
        params: { code: invite.code },
        payload: { displayName: "Carol" },
      });
      yield* carol.groups.leave({ params: { groupId: group.group.id } });
      yield* alice.account.delete({ payload: {} });
      expect(yield* activeOwners(group.group.id)).toEqual([]);

      const code = (id: PlayerId, from: typeof detail) =>
        from.players.find((player) => player.id === id)!.claimCode!;

      const first = yield* dee.guests.claim({ params: { code: code(gusId, detail) } });
      expect(first.role).toBe("owner");

      const later = yield* carol.guests.claim({ params: { code: code(boId, detail) } });
      expect(later.role).toBe("member");
      expect(yield* activeOwners(group.group.id)).toHaveLength(1);
    }),
  );

  it.effect("returns a former owner as a member once someone else owns the group", () =>
    Effect.gen(function* () {
      const { alice, dee } = yield* users("alice", "dee");
      const group = yield* groupWith(alice);
      const gusId = ids.player();
      const boId = ids.player();

      yield* alice.guests.add({
        params: { groupId: group.group.id },
        payload: { id: gusId, displayName: "Gus" },
      });

      const detail = yield* alice.guests.add({
        params: { groupId: group.group.id },
        payload: { id: boId, displayName: "Bo" },
      });

      const code = (id: PlayerId) => detail.players.find((player) => player.id === id)!.claimCode!;

      yield* alice.groups.leave({ params: { groupId: group.group.id } });

      const first = yield* dee.guests.claim({ params: { code: code(gusId) } });
      expect(first.role).toBe("owner");

      const back = yield* alice.guests.claim({ params: { code: code(boId) } });
      expect(back.role).toBe("member");
      expect(yield* activeOwners(group.group.id)).toHaveLength(1);
    }),
  );

  it.effect("returns a removed admin as a member", () =>
    Effect.gen(function* () {
      const { alice, bob } = yield* users("alice", "bob");
      const group = yield* groupWith(alice, bob);
      const bobPlayer = group.players.find((player) => player.id !== group.myPlayerId)!;
      const gusId = ids.player();

      yield* alice.groups.setRole({
        params: { groupId: group.group.id, userId: bobPlayer.userId! },
        payload: { role: "admin" },
      });

      const detail = yield* alice.guests.add({
        params: { groupId: group.group.id },
        payload: { id: gusId, displayName: "Gus" },
      });

      yield* alice.groups.removeMember({
        params: { groupId: group.group.id, userId: bobPlayer.userId! },
      });

      const back = yield* bob.guests.claim({
        params: { code: detail.players.find((player) => player.id === gusId)!.claimCode! },
      });

      expect(back.role).toBe("member");
    }),
  );
});

it.layer(TestApi.layer)("deletion beside pushes", (it) => {
  it.effect("never deadlocks with recording commands at the account's own table", () =>
    Effect.gen(function* () {
      const scenes = yield* Effect.forEach(
        Array.from({ length: 12 }, (_, i) => i),
        () => staleAccount(),
      );

      const pushes = (s: Effect.Success<ReturnType<typeof staleAccount>>) =>
        Array.from({ length: 4 }, (_, index) =>
          Effect.exit(
            s.alice.push(
              finishAt(s.alice.identity, s.opened.visitId, 30 + index, 100),
              toTrip(s.alice.identity, s.opened.tableId, null),
            ),
          ),
        );

      const runs = yield* Effect.forEach(
        scenes,
        (s) =>
          Effect.all(
            [
              s.alice.client.account.delete({ payload: {} }),
              Effect.exit(
                s.alice.client.recording.share({ params: { tableId: s.opened.tableId } }),
              ),
              ...pushes(s),
            ],
            { concurrency: "unbounded" },
          ),
        { concurrency: "unbounded" },
      );

      for (const [deleted] of runs) expect(deleted).toEqual({ status: "complete" });
    }),
  );
});

it.layer(TestApi.layer)("what the fence tells a client", (it) => {
  it.effect("says why a deleted account's token is refused", () =>
    Effect.gen(function* () {
      const s = yield* scene();
      yield* s.alice.account.delete({ payload: {} });

      const refused = yield* Effect.flip(s.alice.groups.list());
      expect(refused).toBeInstanceOf(Unauthorized);
      expect(refused).toMatchObject({ reason: "account_deleted" });

      const recording = yield* Effect.flip(s.alice.recording.history());
      expect(recording).toBeInstanceOf(Unauthorized);
      expect(recording).toMatchObject({ reason: "account_deleted" });
    }),
  );

  it.effect("keeps a new job off the cron's list until the request has had its turn", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const s = yield* scene();
      yield* s.api.whileClerkDown(s.alice.account.delete({ payload: {} }));

      const [job] = yield* sql<{ minutes: number }>`
        select (extract(epoch from next_attempt_at - now()) / 60)::float8 as minutes from account_deletions
        where user_id_hash = ${yield* AccountFence.hashOf(s.aliceId)}
      `;

      expect(job!.minutes).toBeGreaterThan(8);
    }),
  );
});

it.layer(TestApi.layer)("a Clerk job that has failed many times", (it) => {
  it.effect("backs off without overflowing, and leaves the rest of its batch alone", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const api = yield* TestApi;
      yield* clearDueJobs();
      const run = uuid().slice(0, 8);
      const worn = `user_worn_${run}`;
      const fresh = `user_fresh_${run}`;
      api.outside.clerkFailing.add(worn);

      yield* stuckJob(worn, -2);
      yield* sql`update account_deletions set attempts = 40 where user_id_hash = ${yield* AccountFence.hashOf(worn)}`;
      yield* stuckJob(fresh, -1);

      yield* api.retryClerkDeletions;

      expect(api.outside.clerkDeleted).toContain(fresh);

      const [row] = yield* sql<{ attempts: number; minutes: number }>`
        select attempts, (extract(epoch from next_attempt_at - now()) / 60)::float8 as minutes
        from account_deletions where user_id_hash = ${yield* AccountFence.hashOf(worn)}
      `;

      expect(row!.attempts).toBe(41);
      expect(row!.minutes).toBeGreaterThan(300);
      expect(row!.minutes).toBeLessThanOrEqual(360);
    }),
  );
});

const FOREIGN_KEYS = {
  "entries.counterparty_id -> players": "players stay, or the group's entries go with it",
  "entries.created_by -> users": "moved to the audit user",
  "entries.group_id -> players": "players stay, or the group's entries go with it",
  "entries.player_id -> players": "players stay, or the group's entries go with it",
  "entries.voided_by -> users": "moved to the audit user",
  "groups.created_by -> users": "moved to the audit user",
  "invites.created_by -> users": "deleted",
  "memberships.user_id -> users": "deleted",
  "personal_entries.counterparty_id -> players": "players stay, or the group's legacy visits go",
  "personal_operations.player_id -> players": "players stay, or the table's operations go",
  "personal_visits.group_player_id -> players": "players stay, or cleared with the group",
  "personal_visits.player_id -> players": "players stay, or the table's visits go",
  "player_actors.actor_id -> recording_actors": "deleted",
  "player_actors.invited_by_actor -> recording_actors": "cleared",
  "player_actors.player_id -> players": "deleted",
  "player_invites.issued_by_actor -> recording_actors": "deleted",
  "player_invites.player_id -> players": "deleted",
  "players.created_by -> users": "moved to the audit user",
  "players.recording_actor_id -> recording_actors": "cleared",
  "players.recording_actor_kind -> recording_actors": "cleared",
  "players.user_id -> users": "cleared",
  "seatings.created_by -> users": "moved to the audit user",
  "session_players.group_id -> players": "players stay, or the group's sessions go with it",
  "session_players.player_id -> players": "players stay, or the group's sessions go with it",
  "sessions.closed_by -> users": "moved to the audit user",
  "sessions.created_by -> users": "moved to the audit user",
  "stakes.borrower_id -> players": "players stay, or the group's stakes go with it",
  "stakes.created_by -> users": "moved to the audit user",
  "stakes.group_id -> players": "players stay, or the group's stakes go with it",
  "stakes.lender_id -> players": "players stay, or the group's stakes go with it",
  "stakes.voided_by -> users": "moved to the audit user",
  "table_participants.player_id -> players": "players stay, or the table goes",
  "tables.starter_player_id -> players": "players stay, or the table goes",
  "trips.created_by -> users": "moved to the audit user",
  "venues.created_by -> users": "cleared",
} as const;

it.layer(TestApi.layer)("account deletion rules", (it) => {
  it.effect(
    "lists every foreign key to a user, a player or a recording actor, so a new one is noticed",
    () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;

        const keys = yield* sql<{ rule: string }>`
        select distinct c.conrelid::regclass::text || '.' || a.attname || ' -> '
          || c.confrelid::regclass::text as rule
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
        where c.contype = 'f'
          and c.confrelid in ('users'::regclass, 'players'::regclass, 'recording_actors'::regclass)
      `;

        expect(keys.map((key) => key.rule).toSorted()).toEqual(
          Object.keys(FOREIGN_KEYS).toSorted(),
        );
      }),
  );

  it.effect("keeps the append-only trigger on outside a deletion", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { alice, bob } = yield* users("alice", "bob");
      const group = yield* groupWith(alice, bob);
      yield* owe(alice, group, group.players[1]!.id, group.myPlayerId, 100);

      const edit = sql`update entries set note = 'edited' where group_id = ${group.group.id}`;
      expect((yield* Effect.flip(edit))._tag).toBe("SqlError");

      const remove = sql`delete from entries where group_id = ${group.group.id}`;
      expect((yield* Effect.flip(remove))._tag).toBe("SqlError");

      const guarded = sql.withTransaction(
        Effect.gen(function* () {
          yield* sql`select set_config('stacks.account_deletion', 'on', true)`;
          yield* sql`delete from entries where group_id = ${group.group.id}`;

          return yield* Effect.fail("rolled back" as const);
        }),
      );

      expect(yield* Effect.flip(guarded)).toBe("rolled back");

      const [row] = yield* sql<{ count: number }>`
        select count(*)::int as count from entries where group_id = ${group.group.id}
      `;

      expect(row!.count).toBe(1);
    }),
  );
});
