import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import {
  ActorId,
  EntryId,
  MinorUnits,
  PlayerId,
  SeatingId,
  type TableId,
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
  usd,
  users,
  type TestGroup,
} from "../testing/fixtures.test-utils.ts";
import {
  finishHistoricalSession,
  seedEntry,
  seedSession,
} from "../testing/legacySessions.test-utils.ts";
import { at, seatNew, sitDown, start, uuid } from "../testing/recording.test-utils.ts";
import { TestApi } from "../testing/TestApi.test-utils.ts";
import * as LegacyMigration from "./LegacyMigration.ts";

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

const toTrip = (who: RecordingIdentity, tableId: TableId, tripId: TripId) =>
  RecordingCommand.make({ type: "set_table_trip", ...common(who, 1), tableId, tripId });

type SetSeatCommand = Extract<RecordingCommand, { type: "set_seat" }>;

type SetSeatFields = { -readonly [K in keyof SetSeatCommand]: SetSeatCommand[K] };

const setSeat = (
  who: RecordingIdentity,
  tableId: TableId,
  visitId: VisitId,
  seat: number | null,
  minutes: number,
  options: {
    readonly seatingId?: SeatingId;
    readonly replacesSeatingId?: SeatingId;
    readonly reason?: string;
  } = {},
) => {
  const fields: SetSeatFields = {
    type: "set_seat",
    ...common(who, minutes),
    tableId,
    visitId,
    seatingId: options.seatingId ?? SeatingId.make(uuid()),
    seat,
    occurredAt: at(minutes),
  };

  if (options.replacesSeatingId !== undefined) fields.replacesSeatingId = options.replacesSeatingId;

  if (options.reason !== undefined) fields.reason = options.reason;

  // SAFETY: fields sets type to the literal "set_seat".
  return RecordingCommand.make(fields) as SetSeatCommand;
};

const voidSeating = (
  who: RecordingIdentity,
  tableId: TableId,
  visitId: VisitId,
  seatingId: SeatingId,
  minutes: number,
) =>
  RecordingCommand.make({
    type: "void_seating",
    ...common(who, minutes),
    tableId,
    visitId,
    seatingId,
    reason: "Mistake",
  });

const cashOut = (
  who: RecordingIdentity,
  visitId: VisitId,
  revision: number,
  amount: number,
  minutes: number,
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

const beaOf = (group: TestGroup) => group.players.find((p) => p.id !== group.myPlayerId)!;

const statsOf = (client: Client, group: TestGroup) =>
  client.groups.stats({ params: { groupId: group.group.id } });

it.layer(TestApi.layer)("group stats seats", (it) => {
  it.effect(
    "records single and multiple seat outcomes per visit, keeps return visits separate, and ignores voided or stood-up-only events",
    () =>
      Effect.gen(function* () {
        const { alex, bea } = yield* users("alex", "bea");
        const group = yield* groupWith(alex, bea);
        const me = identity();

        const table1 = start(me);
        const table1FirstSeat = setSeat(me, table1.tableId, table1.visitId, 1, 2);
        const table1SecondSeat = setSeat(me, table1.tableId, table1.visitId, 5, 10);

        const beaJoin = seatNew(me, table1.tableId, "Bea");
        const beaVoided = setSeat(me, table1.tableId, beaJoin.visitId, 2, 6);
        const beaActual = setSeat(me, table1.tableId, beaJoin.visitId, 4, 8);

        expect(
          yield* push(
            alex,
            me,
            table1,
            toTrip(me, table1.tableId, group.tripId),
            table1FirstSeat,
            table1SecondSeat,
            beaJoin,
            beaVoided,
            voidSeating(me, table1.tableId, beaJoin.visitId, beaVoided.seatingId, 7),
            beaActual,
            cashOut(me, table1.visitId, 0, 32000, 20),
            cashOut(me, beaJoin.visitId, 0, 15000, 20),
          ),
        ).toEqual(Array.from({ length: 10 }, () => "accepted"));

        const invite = yield* alex.recording.invitePlayer({
          params: { playerId: beaJoin.playerId },
        });

        yield* bea.recording.redeemInvite({
          params: { token: invite.token },
          payload: { identity: identity() },
        });

        const table2 = start(me);
        const visit2Seat = setSeat(me, table2.tableId, table2.visitId, 3, 2);
        const back = sitDown(me, table2.tableId, me.playerId, 25);
        const backSeat = setSeat(me, table2.tableId, back.visitId, 6, 26);

        const stoodOnlyJoin = seatNew(me, table2.tableId, "Bea2");
        const stoodOnlySeat = setSeat(me, table2.tableId, stoodOnlyJoin.visitId, 2, 27);
        const stoodOnly = setSeat(me, table2.tableId, stoodOnlyJoin.visitId, null, 28);

        expect(
          yield* push(
            alex,
            me,
            RecordingCommand.make({ ...table2, tableSeats: 7 }),
            toTrip(me, table2.tableId, group.tripId),
            visit2Seat,
            cashOut(me, table2.visitId, 0, 24000, 20),
            back,
            backSeat,
            cashOut(me, back.visitId, 0, 5000, 40),
            stoodOnlyJoin,
            stoodOnlySeat,
            stoodOnly,
            cashOut(me, stoodOnlyJoin.visitId, 0, 10000, 35),
          ),
        ).toEqual(Array.from({ length: 11 }, () => "accepted"));

        const stats = yield* statsOf(alex, group);

        expect(stats.seats).toEqual(
          expect.arrayContaining([
            {
              playId: table1.tableId,
              playerId: group.myPlayerId,
              seat: "multiple",
              net: MinorUnits.make(12000),
              milliseconds: 20 * 60_000,
            },
            {
              playId: table1.tableId,
              playerId: beaOf(group).id,
              seat: 4,
              net: MinorUnits.make(5000),
              milliseconds: 15 * 60_000,
            },
            {
              playId: table2.tableId,
              playerId: group.myPlayerId,
              seat: 3,
              net: MinorUnits.make(4000),
              milliseconds: 20 * 60_000,
            },
            {
              playId: table2.tableId,
              playerId: group.myPlayerId,
              seat: 6,
              net: MinorUnits.make(-5000),
              milliseconds: 15 * 60_000,
            },
          ]),
        );
        expect(stats.seats).toHaveLength(4);
      }),
  );

  it.effect(
    "excludes unlinked guests, live visits, device-only tables, and non-blackjack games, and enforces membership",
    () =>
      Effect.gen(function* () {
        const { alex, carl } = yield* users("alex", "carl");
        const group = yield* groupWith(alex);
        const me = identity();

        const live = start(me);
        const liveSeat = setSeat(me, live.tableId, live.visitId, 1, 2);

        const deviceOnly = start(me);
        const deviceOnlySeat = setSeat(me, deviceOnly.tableId, deviceOnly.visitId, 2, 2);

        const craps = start(me);

        const finished = start(me);
        const unlinked = seatNew(me, finished.tableId, "Stray Guest");
        const unlinkedSeat = setSeat(me, finished.tableId, unlinked.visitId, 5, 6);

        expect(
          yield* push(
            alex,
            me,
            live,
            toTrip(me, live.tableId, group.tripId),
            liveSeat,
            deviceOnly,
            deviceOnlySeat,
            cashOut(me, deviceOnly.visitId, 0, 21000, 15),
            RecordingCommand.make({ ...craps, game: "craps" }),
            toTrip(me, craps.tableId, group.tripId),
            cashOut(me, craps.visitId, 0, 21000, 15),
            finished,
            toTrip(me, finished.tableId, group.tripId),
            unlinked,
            unlinkedSeat,
            cashOut(me, finished.visitId, 0, 21000, 15),
            cashOut(me, unlinked.visitId, 0, 15000, 15),
          ),
        ).toEqual(Array.from({ length: 15 }, () => "accepted"));

        const stats = yield* statsOf(alex, group);
        expect(stats.seats).toEqual([]);
        expect((yield* Effect.flip(statsOf(carl, group)))._tag).toBe("Forbidden");
      }),
  );

  it.effect(
    "uses visitSeatOutcome for legacy blackjack seatings and counts imported legacy sessions once",
    () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const { alex, bea } = yield* users("alex", "bea");
        const group = yield* groupWith(alex, bea);
        const alexId = group.myPlayerId;
        const beaId = beaOf(group).id;
        const venue = yield* catalogVenue(alex);
        const startedAt = DateTime.makeUnsafe("2026-10-21T20:00:00Z");

        const importedId = yield* seedSession(group.tripId, {
          id: ids.session(),
          venueId: venue.id,
          game: "blackjack",
          playerIds: [alexId, beaId],
          notes: null,
          tableSeats: 7,
          startedAt,
        });

        yield* seedEntry(importedId, {
          id: ids.entry(),
          kind: "buy_in",
          playerId: alexId,
          counterpartyId: null,
          amount: usd(10000),
          note: null,
          replacesEntryId: null,
        });
        yield* seedEntry(importedId, {
          id: ids.entry(),
          kind: "buy_in",
          playerId: beaId,
          counterpartyId: null,
          amount: usd(10000),
          note: null,
          replacesEntryId: null,
        });

        const legacyEvents = [
          [alexId, 1, 0],
          [alexId, 3, 1],
          [alexId, 3, 2],
          [beaId, 4, 3],
        ] as const;

        for (const [playerId, seat, minute] of legacyEvents) {
          yield* sql`
            insert into seatings (id, session_id, group_id, player_id, seat, occurred_at, created_by)
            select ${ids.seating()}, s.id, s.group_id, ${playerId}, ${seat}, ${new Date(Date.UTC(2026, 9, 21, 20, minute))}, s.created_by
            from sessions s where s.id = ${importedId}
          `;
        }

        yield* finishHistoricalSession(importedId, {
          endedAt: DateTime.makeUnsafe("2026-10-21T21:00:00Z"),
          cashOuts: [
            { id: ids.entry(), playerId: alexId, amount: usd(16000) },
            { id: ids.entry(), playerId: beaId, amount: usd(8000) },
          ],
        });

        yield* LegacyMigration.importLegacy({ scope: [group.group.id], dryRun: false });

        const stats = yield* statsOf(alex, group);

        expect(stats.seats).toEqual(
          expect.arrayContaining([
            {
              playId: importedId,
              playerId: alexId,
              seat: "multiple",
              net: MinorUnits.make(6000),
              milliseconds: 60 * 60_000,
            },
            {
              playId: importedId,
              playerId: beaId,
              seat: 4,
              net: MinorUnits.make(-2000),
              milliseconds: 60 * 60_000,
            },
          ]),
        );
        expect(stats.seats).toHaveLength(2);
      }),
  );
});
