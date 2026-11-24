import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import {
  ActorId,
  CurrentUser,
  EntryId,
  groupScope,
  PlayerId,
  ScopeCloseCode,
  StakeId,
  TableId,
  tableScope,
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
  at,
  finish,
  recorderCommand,
  sitDown,
  start,
  uuid,
} from "../testing/recording.test-utils.ts";
import { TestApi } from "../testing/TestApi.test-utils.ts";
import * as Access from "./Access.ts";
import * as Account from "./Account.ts";
import * as AccountFence from "./AccountFence.ts";
import { DELETED_ACTOR } from "./AccountFence.ts";
import * as LegacyMigration from "./LegacyMigration.ts";
import * as Realtime from "./Realtime.ts";
import { digest } from "./Recording.ts";

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

const mentions = Effect.fn("test.mentions")(function* (...needles: ReadonlyArray<string>) {
  const sql = yield* SqlClient.SqlClient;

  const tables = yield* sql<{ name: string }>`
    select table_name as name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  `;

  const found: Array<string> = [];

  for (const { name } of tables)
    for (const needle of needles) {
      const [row] = yield* sql<{ count: number }>`
        select count(*)::int as count from ${sql(name)} t where t::text like ${`%${needle}%`}
      `;

      if (row!.count > 0) found.push(`${name}: ${needle}`);
    }

  return found;
});

/**
 * Alice owns a group with Bob and has a table in its trip: she and Bob played at it, she stood
 * up during an absence and sat down again, and Bob can record for everyone. She also owns a group
 * of her own with a table, and has a stake, an open balance and a voided entry in the shared one.
 */
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
      const s = yield* scene();
      const before = yield* standingsOf(s.bob, s.group.group.id, s.group.tripId, s.side.id);
      const owner = (yield* s.bob.groups.get({ params: { groupId: s.group.group.id } })).role;
      expect(owner).toBe("member");
      expect(before.trip.tables).toHaveLength(2);
      expect((yield* mentions(s.aliceId, s.aliceMe.actorId)).length).toBeGreaterThan(0);

      expect(yield* s.alice.account.delete({ payload: {} })).toEqual({ status: "complete" });

      expect(yield* standingsOf(s.bob, s.group.group.id, s.group.tripId, s.side.id)).toEqual(
        before,
      );
      expect(yield* mentions(s.aliceId, s.aliceMe.actorId)).toEqual([]);

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
      expect((yield* Effect.flip(s.alice.account.delete({ payload: {} })))._tag).toBe(
        "Unauthorized",
      );

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

      const closeOf = (scope: string, selector: object, code = ScopeCloseCode.revoked) => ({
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
            shareHash: yield* digest(s.token),
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
      const attempts = s.api.outside.clerkAttempts;

      expect(yield* s.api.whileClerkDown(s.alice.account.delete({ payload: {} }))).toEqual({
        status: "pending",
      });
      expect(s.api.outside.clerkAttempts - attempts).toBe(3);
      expect(yield* jobOf(s.aliceId)).toEqual({
        userId: s.aliceId,
        clerkDeleted: false,
        appleRevoked: false,
      });
      expect((yield* Effect.flip(s.alice.groups.list()))._tag).toBe("Unauthorized");

      yield* s.api.whileClerkDown(s.api.retryClerkDeletions);
      expect((yield* jobOf(s.aliceId))?.clerkDeleted).toBe(false);
      expect(s.api.outside.clerkDeleted).not.toContain(s.aliceId);

      yield* s.api.retryClerkDeletions;
      expect(yield* jobOf(s.aliceId)).toEqual({
        userId: null,
        clerkDeleted: true,
        appleRevoked: false,
      });
      expect(s.api.outside.clerkDeleted).toContain(s.aliceId);

      const done = s.api.outside.clerkAttempts;
      yield* s.api.retryClerkDeletions;
      expect(s.api.outside.clerkAttempts).toBe(done);
    }),
  );

  it.effect("returns the job's state to a duplicate request, and cleans up once", () =>
    Effect.gen(function* () {
      const s = yield* scene();
      const before = s.api.outside.clerkAttempts;

      const first = yield* s.api.withOutside(deleting(s.aliceId));
      const second = yield* s.api.withOutside(deleting(s.aliceId));

      expect([first, second]).toEqual([{ status: "complete" }, { status: "complete" }]);
      expect(s.api.outside.clerkAttempts - before).toBe(1);
      expect(s.api.outside.appleRevoked.filter((code) => code === "apple-code")).toHaveLength(1);
    }),
  );

  it.effect("keeps a lost response pending until the retry, without asking Clerk again", () =>
    Effect.gen(function* () {
      const s = yield* scene();

      expect(yield* s.api.whileClerkDown(s.api.withOutside(deleting(s.aliceId)))).toEqual({
        status: "pending",
      });
      const asked = s.api.outside.clerkAttempts;
      expect(yield* s.api.withOutside(deleting(s.aliceId))).toEqual({ status: "pending" });
      expect(s.api.outside.clerkAttempts).toBe(asked);
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
  it.effect("keeps an imported table, and imports again as before", () =>
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
  it.effect("handles every foreign key that points at a user, a player or a recording actor", () =>
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

      expect(keys.map((key) => key.rule).toSorted()).toEqual(Object.keys(FOREIGN_KEYS).toSorted());
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
