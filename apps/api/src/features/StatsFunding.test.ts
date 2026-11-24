import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import { ActorId, EntryId, PlayerId, StakeId, type TableId, type VisitId } from "@stacks/contracts";
import {
  RecordingCommand,
  RecordingOperationId,
  type RecordingIdentity,
} from "@stacks/contracts/recordingCommands";

import { catalogVenue, groupWith, ids, usd, users } from "../testing/fixtures.test-utils.ts";
import {
  finishHistoricalSession,
  seedEntry,
  seedSession,
} from "../testing/legacySessions.test-utils.ts";
import {
  at,
  deleteVisit,
  openTable,
  seatNew,
  sitDown,
  start,
  uuid,
} from "../testing/recording.test-utils.ts";
import { TestApi } from "../testing/TestApi.test-utils.ts";
import * as LegacyMigration from "./LegacyMigration.ts";
import type { TestGroup } from "../testing/fixtures.test-utils.ts";

type Client = Effect.Success<ReturnType<TestApi["Service"]["as"]>>;

const identity = () => ({
  playerId: PlayerId.make(uuid()),
  actorId: ActorId.make(uuid()),
});

const push = (client: Client, who: RecordingIdentity, ...commands: Array<RecordingCommand>) =>
  client.recording
    .push({ payload: { identity: who, commands } })
    .pipe(Effect.map(({ results }) => results.map((result) => result.status)));

const common = (who: RecordingIdentity, minutes: number) => ({
  operationId: RecordingOperationId.make(uuid()),
  actorId: who.actorId,
  preparedAt: at(minutes),
});

const toTrip = (who: RecordingIdentity, tableId: TableId, tripId: TestGroup["tripId"]) =>
  RecordingCommand.make({ type: "set_table_trip", ...common(who, 1), tableId, tripId });

const buyIn = (
  who: RecordingIdentity,
  visitId: VisitId,
  revision: number,
  amount: number,
  counterpartyId?: PlayerId,
) => {
  const base = {
    type: "add" as const,
    ...common(who, 10),
    visitId,
    expectedRevision: revision,
    entryId: EntryId.make(uuid()),
    kind: "buy_in" as const,
    amount: usd(amount),
    occurredAt: at(10),
    note: null,
  };

  // SAFETY: the payload's type is the literal "add", so this is that member of RecordingCommand.
  return RecordingCommand.make(
    counterpartyId === undefined ? base : { ...base, counterpartyId },
  ) as Extract<RecordingCommand, { type: "add" }>;
};

const cashOut = (
  who: RecordingIdentity,
  visitId: VisitId,
  revision: number,
  amount: number,
  minutes = 20,
) =>
  RecordingCommand.make({
    type: "finish",
    ...common(who, minutes),
    visitId,
    expectedRevision: revision,
    entryId: EntryId.make(uuid()),
    amount: usd(amount),
    finishedAt: at(minutes),
  });

const fix = (
  who: RecordingIdentity,
  visitId: VisitId,
  revision: number,
  entryId: EntryId,
  replacementId: EntryId,
) =>
  RecordingCommand.make({
    type: "correct",
    ...common(who, 30),
    visitId,
    expectedRevision: revision,
    entryId,
    reason: "Wrong amount",
    replacement: { id: replacementId, amount: usd(9000), occurredAt: at(5), note: null },
  });

const statsOf = (client: Client, group: TestGroup) =>
  client.groups.stats({ params: { groupId: group.group.id } });

type Kind = "buy_in" | "cash_out" | "adjustment";

const day = (n: number) => DateTime.makeUnsafe(`2026-10-${20 + n}T20:00:00Z`);

const session = Effect.fn("test.session")(function* (
  client: Client,
  group: TestGroup,
  entries: ReadonlyArray<{
    readonly kind: Kind;
    readonly playerId: PlayerId;
    readonly amount: number;
    readonly counterpartyId?: PlayerId;
    readonly replaces?: EntryId;
    readonly id?: EntryId;
  }>,
  options: {
    readonly tripId?: TestGroup["tripId"];
    readonly on?: number;
    readonly live?: true;
  } = {},
) {
  const venue = yield* catalogVenue(client);
  const sessionId = ids.session();

  yield* seedSession(options.tripId ?? group.tripId, {
    id: sessionId,
    venueId: venue.id,
    game: "blackjack",
    playerIds: Array.from(new Set(entries.map((entry) => entry.playerId))),
    notes: null,
    startedAt: day(options.on ?? 0),
  });

  for (const entry of entries)
    yield* seedEntry(sessionId, {
      id: entry.id ?? ids.entry(),
      kind: entry.kind,
      playerId: entry.playerId,
      counterpartyId: entry.counterpartyId ?? null,
      amount: usd(entry.amount),
      note: null,
      replacesEntryId: entry.replaces ?? null,
    });

  if (options.live === undefined) yield* finishHistoricalSession(sessionId);

  return sessionId;
});

const sharedTable = Effect.fn("test.sharedTable")(function* (
  alex: Client,
  bea: Client,
  group: TestGroup,
) {
  const me = identity();
  const opened = start(me);
  const beaSeat = seatNew(me, opened.tableId, "Bea");

  expect(yield* push(alex, me, opened, beaSeat, toTrip(me, opened.tableId, group.tripId))).toEqual([
    "accepted",
    "accepted",
    "accepted",
  ]);

  const invite = yield* alex.recording.invitePlayer({ params: { playerId: beaSeat.playerId } });

  yield* bea.recording.redeemInvite({
    params: { token: invite.token },
    payload: { identity: identity() },
  });

  return { me, opened, beaSeat };
});

const beaOf = (group: TestGroup) => group.players.find((p) => p.id !== group.myPlayerId)!;

it.layer(TestApi.layer)("group stats funding", (it) => {
  it.effect("counts additional buy-ins per visit, so two return visits make no extra", () =>
    Effect.gen(function* () {
      const { alex } = yield* users("alex");
      const group = yield* groupWith(alex);
      const me = identity();
      const opened = start(me);
      const back = sitDown(me, opened.tableId, me.playerId, 25);

      expect(
        yield* push(
          alex,
          me,
          opened,
          toTrip(me, opened.tableId, group.tripId),
          cashOut(me, opened.visitId, 0, 25000, 20),
          back,
          cashOut(me, back.visitId, 0, 5000, 40),
        ),
      ).toEqual(["accepted", "accepted", "accepted", "accepted", "accepted"]);

      const stats = yield* statsOf(alex, group);
      expect(stats.plays).toHaveLength(1);
      expect(stats.reloads).toEqual([]);
      expect(stats.allVisits).toEqual([{ playId: opened.tableId, visits: 2 }]);
    }),
  );

  it.effect("counts a visit with an additional buy-in, with its result", () =>
    Effect.gen(function* () {
      const { alex } = yield* users("alex");
      const group = yield* groupWith(alex);
      const me = identity();
      const opened = start(me);

      expect(
        yield* push(
          alex,
          me,
          opened,
          toTrip(me, opened.tableId, group.tripId),
          buyIn(me, opened.visitId, 0, 5000),
          buyIn(me, opened.visitId, 1, 5000),
          cashOut(me, opened.visitId, 2, 40000),
        ),
      ).toEqual(["accepted", "accepted", "accepted", "accepted", "accepted"]);

      const stats = yield* statsOf(alex, group);
      expect(stats.reloads).toEqual([
        { playId: opened.tableId, playerId: group.myPlayerId, additional: 2, net: 10000 },
      ]);
      expect(stats.allVisits).toEqual([{ playId: opened.tableId, visits: 1 }]);
      expect(stats.covered).toEqual([]);
    }),
  );

  it.effect("counts a corrected native buy-in once, however many times it was corrected", () =>
    Effect.gen(function* () {
      const { alex } = yield* users("alex");
      const group = yield* groupWith(alex);
      const me = identity();
      const opened = start(me);
      const extra = buyIn(me, opened.visitId, 0, 5000);
      const second = EntryId.make(uuid());
      const third = EntryId.make(uuid());

      expect(
        yield* push(
          alex,
          me,
          opened,
          toTrip(me, opened.tableId, group.tripId),
          extra,
          fix(me, opened.visitId, 1, extra.entryId, second),
          fix(me, opened.visitId, 2, second, third),
          cashOut(me, opened.visitId, 3, 40000),
        ),
      ).toEqual(["accepted", "accepted", "accepted", "accepted", "accepted", "accepted"]);

      const stats = yield* statsOf(alex, group);
      expect(stats.reloads).toEqual([
        { playId: opened.tableId, playerId: group.myPlayerId, additional: 1, net: 11000 },
      ]);
    }),
  );

  it.effect("counts a multi-step correction once and drops a pure void, on older sessions", () =>
    Effect.gen(function* () {
      const { alex } = yield* users("alex");
      const group = yield* groupWith(alex);
      const player = group.myPlayerId;
      const first = ids.entry();
      const second = ids.entry();
      const third = ids.entry();

      const corrected = yield* session(alex, group, [
        { kind: "buy_in", playerId: player, amount: 10000 },
        { id: first, kind: "buy_in", playerId: player, amount: 5000 },
        { id: second, kind: "buy_in", playerId: player, amount: 6000, replaces: first },
        { id: third, kind: "buy_in", playerId: player, amount: 7000, replaces: second },
        { kind: "cash_out", playerId: player, amount: 30000 },
      ]);

      const removed = ids.entry();

      const voided = yield* session(alex, group, [
        { kind: "buy_in", playerId: player, amount: 10000 },
        { id: removed, kind: "buy_in", playerId: player, amount: 5000 },
        { kind: "cash_out", playerId: player, amount: 12000 },
      ]);

      const sql = yield* SqlClient.SqlClient;
      yield* sql`update entries set voided_at = now(), voided_by = created_by where id = ${removed}`;

      const stats = yield* statsOf(alex, group);
      expect(stats.reloads).toEqual([
        { playId: corrected, playerId: player, additional: 1, net: 13000 },
      ]);
      expect(stats.allVisits).toEqual(
        expect.arrayContaining([
          { playId: corrected, visits: 1 },
          { playId: voided, visits: 1 },
        ]),
      );
    }),
  );

  it.effect("includes a guest who paid for a buy-in on an older session", () =>
    Effect.gen(function* () {
      const { alex } = yield* users("alex");
      const group = yield* groupWith(alex);
      const guestId = ids.player();

      yield* alex.guests.add({
        params: { groupId: group.group.id },
        payload: { id: guestId, displayName: "Gus" },
      });

      const played = yield* session(alex, group, [
        { kind: "buy_in", playerId: group.myPlayerId, amount: 10000, counterpartyId: guestId },
        { kind: "buy_in", playerId: group.myPlayerId, amount: 5000 },
        { kind: "cash_out", playerId: group.myPlayerId, amount: 20000 },
      ]);

      const stats = yield* statsOf(alex, group);
      expect(stats.covered).toEqual([
        { playId: played, payerId: guestId, playerId: group.myPlayerId, amount: 10000 },
      ]);
      expect(stats.reloads).toEqual([
        { playId: played, playerId: group.myPlayerId, additional: 1, net: 5000 },
      ]);
    }),
  );

  it.effect("leaves out a native buy-in paid by someone no group member is linked to", () =>
    Effect.gen(function* () {
      const { alex } = yield* users("alex");
      const group = yield* groupWith(alex);
      const me = identity();
      const opened = start(me);
      const dave = seatNew(me, opened.tableId, "Dave");

      expect(
        yield* push(
          alex,
          me,
          opened,
          dave,
          toTrip(me, opened.tableId, group.tripId),
          buyIn(me, opened.visitId, 0, 5000, dave.playerId),
          cashOut(me, opened.visitId, 1, 30000),
          cashOut(me, dave.visitId, 0, 10000),
        ),
      ).toEqual(["accepted", "accepted", "accepted", "accepted", "accepted", "accepted"]);

      const stats = yield* statsOf(alex, group);
      expect(stats.plays).toHaveLength(1);
      expect(stats.covered).toEqual([]);
      expect(stats.reloads).toEqual([
        { playId: opened.tableId, playerId: group.myPlayerId, additional: 1, net: 5000 },
      ]);
    }),
  );

  it.effect("includes a native buy-in paid by a linked member who never sat at the table", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const me = identity();
      const opened = openTable(me);

      // SAFETY: seatNew is a join_table command, and counterpartyId stays on that same member.
      const beaSeat = RecordingCommand.make({
        ...seatNew(me, opened.tableId, "Bea"),
        counterpartyId: me.playerId,
      }) as Extract<RecordingCommand, { type: "join_table" }>;

      expect(
        yield* push(alex, me, opened, beaSeat, toTrip(me, opened.tableId, group.tripId)),
      ).toEqual(["accepted", "accepted", "accepted"]);

      const invite = yield* alex.recording.invitePlayer({
        params: { playerId: beaSeat.playerId },
      });

      yield* bea.recording.redeemInvite({
        params: { token: invite.token },
        payload: { identity: identity() },
      });

      expect(yield* push(alex, me, cashOut(me, beaSeat.visitId, 0, 15000))).toEqual(["accepted"]);

      const stats = yield* statsOf(bea, group);
      expect(stats.covered).toEqual([
        {
          playId: opened.tableId,
          payerId: group.myPlayerId,
          playerId: beaOf(group).id,
          amount: 10000,
        },
      ]);
    }),
  );

  it.effect("keeps a former member's earlier entries in the group's history", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const { me, opened, beaSeat } = yield* sharedTable(alex, bea, group);

      expect(
        yield* push(
          alex,
          me,
          buyIn(me, opened.visitId, 0, 5000, beaSeat.playerId),
          cashOut(me, opened.visitId, 1, 30000),
          cashOut(me, beaSeat.visitId, 0, 10000),
        ),
      ).toEqual(["accepted", "accepted", "accepted"]);

      const before = yield* statsOf(alex, group);

      const expected = [
        {
          playId: opened.tableId,
          payerId: beaOf(group).id,
          playerId: group.myPlayerId,
          amount: 5000,
        },
      ];

      expect(before.covered).toEqual(expected);

      yield* alex.groups.removeMember({
        params: { groupId: group.group.id, userId: beaOf(group).userId! },
      });
      yield* sql`
        update memberships set left_at = ${DateTime.toDateUtc(at(10))}
        where group_id = ${group.group.id} and user_id = ${beaOf(group).userId!}
      `;

      const after = yield* statsOf(alex, group);
      expect(after.covered).toEqual(expected);
      expect(
        (yield* Effect.flip(bea.groups.stats({ params: { groupId: group.group.id } })))._tag,
      ).toBe("Forbidden");
    }),
  );

  it.effect("refuses someone outside the group", () =>
    Effect.gen(function* () {
      const { alex, carl } = yield* users("alex", "carl");
      const group = yield* groupWith(alex);

      expect((yield* Effect.flip(statsOf(carl, group)))._tag).toBe("Forbidden");
    }),
  );

  it.effect("shows a reopened visit's table as unfinished and a deleted visit as gone", () =>
    Effect.gen(function* () {
      const { alex } = yield* users("alex");
      const group = yield* groupWith(alex);
      const me = identity();
      const opened = start(me);

      expect(
        yield* push(
          alex,
          me,
          opened,
          toTrip(me, opened.tableId, group.tripId),
          buyIn(me, opened.visitId, 0, 5000),
          cashOut(me, opened.visitId, 1, 40000),
        ),
      ).toEqual(["accepted", "accepted", "accepted", "accepted"]);
      expect((yield* statsOf(alex, group)).reloads).toHaveLength(1);

      const reopened = RecordingCommand.make({
        type: "reopen",
        ...common(me, 40),
        visitId: opened.visitId,
        expectedRevision: 2,
        reason: "Not done",
      });

      expect(yield* push(alex, me, reopened)).toEqual(["accepted"]);
      const live = yield* statsOf(alex, group);
      expect([live.plays, live.reloads, live.allVisits]).toEqual([[], [], []]);

      expect(yield* push(alex, me, cashOut(me, opened.visitId, 3, 40000, 50))).toEqual([
        "accepted",
      ]);
      expect((yield* statsOf(alex, group)).reloads).toHaveLength(1);

      expect(yield* push(alex, me, deleteVisit(me, opened.visitId, 4))).toEqual(["accepted"]);
      const deleted = yield* statsOf(alex, group);
      expect([deleted.plays, deleted.reloads, deleted.covered]).toEqual([[], [], []]);
    }),
  );

  it.effect("counts an imported older session once, next to native and older plays", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const alexId = group.myPlayerId;
      const beaId = beaOf(group).id;

      const imported = yield* session(alex, group, [
        { kind: "buy_in", playerId: alexId, amount: 10000, counterpartyId: beaId },
        { kind: "buy_in", playerId: alexId, amount: 5000 },
        { kind: "cash_out", playerId: alexId, amount: 20000 },
      ]);

      yield* LegacyMigration.importLegacy({ scope: [group.group.id], dryRun: false });

      const kept = yield* session(alex, group, [
        { kind: "buy_in", playerId: beaId, amount: 10000 },
        { kind: "buy_in", playerId: beaId, amount: 10000 },
        { kind: "cash_out", playerId: beaId, amount: 5000 },
      ]);

      const me = (yield* alex.recording.history()).identity ?? identity();
      const opened = start(me);

      expect(
        yield* push(
          alex,
          me,
          opened,
          toTrip(me, opened.tableId, group.tripId),
          buyIn(me, opened.visitId, 0, 5000),
          cashOut(me, opened.visitId, 1, 40000),
        ),
      ).toEqual(["accepted", "accepted", "accepted", "accepted"]);

      const stats = yield* statsOf(alex, group);
      expect(stats.plays.map((play) => play.id).toSorted()).toEqual(
        [imported, kept, opened.tableId].toSorted(),
      );
      expect(stats.reloads?.map((reload) => reload.playId).toSorted()).toEqual(
        [imported, kept, opened.tableId].toSorted(),
      );
      expect(stats.covered).toEqual([
        { playId: imported, payerId: beaId, playerId: alexId, amount: 10000 },
      ]);
      expect(stats.allVisits?.map((item) => item.visits)).toEqual([1, 1, 1]);
    }),
  );

  it.effect("keeps stakes in different trips apart", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const lender = group.myPlayerId;
      const borrower = beaOf(group).id;

      const first = yield* alex.stakes.create({
        params: { tripId: group.tripId },
        payload: {
          id: StakeId.make(uuid()),
          lenderId: lender,
          borrowerId: borrower,
          amount: usd(100000),
          lenderShare: 50,
          startedAt: day(1),
          note: null,
        },
      });

      yield* session(alex, group, [{ kind: "adjustment", playerId: borrower, amount: 40000 }], {
        on: 2,
      });
      yield* alex.trips.end({ params: { tripId: group.tripId }, payload: { endedAt: day(3) } });

      const next = yield* alex.trips.create({
        params: { groupId: group.group.id },
        payload: { id: ids.trip(), name: "Reno" },
      });

      const second = yield* alex.stakes.create({
        params: { tripId: next.id },
        payload: {
          id: StakeId.make(uuid()),
          lenderId: borrower,
          borrowerId: lender,
          amount: usd(20000),
          lenderShare: 25,
          startedAt: day(4),
          note: null,
        },
      });

      const stats = yield* statsOf(alex, group);
      expect(stats.stakes).toEqual([
        {
          stakeId: first.id,
          tripId: group.tripId,
          lenderId: lender,
          borrowerId: borrower,
          amount: 100000,
          owed: 120000,
          final: true,
        },
        {
          stakeId: second.id,
          tripId: next.id,
          lenderId: borrower,
          borrowerId: lender,
          amount: 20000,
          owed: 20000,
          final: false,
        },
      ]);
    }),
  );

  it.effect("reads an open stake with no play as owing its full amount so far", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);

      const stake = yield* alex.stakes.create({
        params: { tripId: group.tripId },
        payload: {
          id: StakeId.make(uuid()),
          lenderId: group.myPlayerId,
          borrowerId: beaOf(group).id,
          amount: usd(50000),
          lenderShare: 50,
          startedAt: day(1),
          note: null,
        },
      });

      const stats = yield* statsOf(alex, group);
      expect(stats.plays).toEqual([]);
      expect(stats.stakes).toEqual([
        {
          stakeId: stake.id,
          tripId: group.tripId,
          lenderId: group.myPlayerId,
          borrowerId: beaOf(group).id,
          amount: 50000,
          owed: 50000,
          final: false,
        },
      ]);
    }),
  );

  it.effect('keeps an ended stake "so far" while a session it covers is live', () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const borrower = beaOf(group).id;

      const stake = yield* alex.stakes.create({
        params: { tripId: group.tripId },
        payload: {
          id: StakeId.make(uuid()),
          lenderId: group.myPlayerId,
          borrowerId: borrower,
          amount: usd(50000),
          lenderShare: 50,
          startedAt: day(1),
          note: null,
        },
      });

      const running = yield* session(
        alex,
        group,
        [{ kind: "buy_in", playerId: borrower, amount: 10000 }],
        { on: 2, live: true },
      );

      yield* alex.stakes.end({ params: { stakeId: stake.id }, payload: { endedAt: day(3) } });
      expect((yield* statsOf(alex, group)).stakes?.[0]).toMatchObject({ final: false });

      yield* seedEntry(running, {
        id: ids.entry(),
        kind: "cash_out",
        playerId: borrower,
        counterpartyId: null,
        amount: usd(30000),
        note: null,
        replacesEntryId: null,
      });
      yield* finishHistoricalSession(running);

      const done = yield* statsOf(alex, group);
      expect(done.stakes?.[0]).toMatchObject({ owed: 60000, final: true });
    }),
  );

  it.effect("shows a stake's end, reopening and void on the next fetch", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);

      const stake = yield* alex.stakes.create({
        params: { tripId: group.tripId },
        payload: {
          id: StakeId.make(uuid()),
          lenderId: group.myPlayerId,
          borrowerId: beaOf(group).id,
          amount: usd(50000),
          lenderShare: 50,
          startedAt: day(1),
          note: null,
        },
      });

      const finals = () =>
        statsOf(alex, group).pipe(Effect.map((stats) => stats.stakes?.map((row) => row.final)));

      expect(yield* finals()).toEqual([false]);
      yield* alex.stakes.end({ params: { stakeId: stake.id }, payload: { endedAt: day(2) } });
      expect(yield* finals()).toEqual([true]);
      yield* alex.stakes.reopen({ params: { stakeId: stake.id } });
      expect(yield* finals()).toEqual([false]);
      yield* alex.stakes.void({ params: { stakeId: stake.id }, payload: { reason: null } });
      expect(yield* finals()).toEqual([]);
    }),
  );
});
