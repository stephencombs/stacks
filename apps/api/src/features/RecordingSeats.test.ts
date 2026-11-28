import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import {
  EntryId,
  PlayerId,
  SeatingId,
  tableScope,
  type TableId,
  type VisitId,
} from "@stacks/contracts";
import {
  RecordingCommand,
  RecordingOperationId,
  type RecordingIdentity,
} from "@stacks/contracts/recordingCommands";

import { usd } from "../testing/fixtures.test-utils.ts";
import {
  account,
  at,
  device,
  recorderCommand,
  sharedTable,
  sitDown,
  start,
  uuid,
} from "../testing/recording.test-utils.ts";
import { TestApi } from "../testing/TestApi.test-utils.ts";

const cmdCommon = (identity: RecordingIdentity, minutes: number) => ({
  operationId: RecordingOperationId.make(uuid()),
  actorId: identity.actorId,
  preparedAt: at(minutes),
});

const setTableSeats = (
  identity: RecordingIdentity,
  tableId: TableId,
  tableSeats: number | null,
  minutes = 3,
) =>
  RecordingCommand.make({
    type: "set_table_seats",
    ...cmdCommon(identity, minutes),
    tableId,
    tableSeats,
  });

type SetSeatCommand = Extract<RecordingCommand, { type: "set_seat" }>;

type SetSeatFields = { -readonly [K in keyof SetSeatCommand]: SetSeatCommand[K] };

const setSeat = (
  identity: RecordingIdentity,
  tableId: TableId,
  visitId: VisitId,
  spot: number | null | Array<number>,
  minutes: number,
  options: {
    readonly seatingId?: SeatingId;
    readonly replacesSeatingId?: SeatingId;
    readonly reason?: string;
  } = {},
) => {
  const seat = Array.isArray(spot) ? null : spot;

  const fields: SetSeatFields = {
    type: "set_seat",
    ...cmdCommon(identity, minutes),
    tableId,
    visitId,
    seatingId: options.seatingId ?? SeatingId.make(uuid()),
    seat,
    occurredAt: at(minutes),
  };

  if (Array.isArray(spot)) fields.seats = spot;

  if (options.replacesSeatingId !== undefined) fields.replacesSeatingId = options.replacesSeatingId;

  if (options.reason !== undefined) fields.reason = options.reason;

  // SAFETY: fields sets type to the literal "set_seat".
  return RecordingCommand.make(fields) as SetSeatCommand;
};

const voidSeating = (
  identity: RecordingIdentity,
  tableId: TableId,
  visitId: VisitId,
  seatingId: SeatingId,
  minutes: number,
  reason = "Mistake",
) =>
  RecordingCommand.make({
    type: "void_seating",
    ...cmdCommon(identity, minutes),
    tableId,
    visitId,
    seatingId,
    reason,
  });

const addBuyIn = (
  identity: RecordingIdentity,
  visitId: VisitId,
  expectedRevision: number,
  amount: number,
  minutes = 15,
) =>
  RecordingCommand.make({
    type: "add",
    ...cmdCommon(identity, minutes),
    visitId,
    expectedRevision,
    entryId: EntryId.make(uuid()),
    kind: "buy_in",
    amount: usd(amount),
    occurredAt: at(minutes),
    note: null,
  });

const finishAt = (
  identity: RecordingIdentity,
  visitId: VisitId,
  expectedRevision: number,
  amount: number,
  minutes = 20,
) =>
  RecordingCommand.make({
    type: "finish",
    ...cmdCommon(identity, minutes),
    visitId,
    expectedRevision,
    entryId: EntryId.make(uuid()),
    amount: usd(amount),
    finishedAt: at(minutes),
  });

it.layer(TestApi.layer)("recording seatings and table sizes", (it) => {
  it.effect(
    "round-trips tableSeats, seatings, permissions, replacements, voids, and table notices",
    () =>
      Effect.gen(function* () {
        const api = yield* TestApi;
        const alice = yield* account("alice");
        const bob = yield* account("bob");
        const carol = yield* device();

        const opened = start(alice.identity);

        const started = RecordingCommand.make({
          ...opened,
          tableSeats: 7,
        });

        const aliceSeat7 = setSeat(alice.identity, opened.tableId, opened.visitId, 7, 2);
        expect(yield* alice.push(started, aliceSeat7)).toEqual(["accepted", "accepted"]);

        const { token } = yield* alice.client.recording.share({
          params: { tableId: opened.tableId },
        });

        const bobJoined = yield* bob.join(token, {
          id: PlayerId.make(uuid()),
          displayName: "Bob",
        });

        const carolJoined = yield* carol.join(token, {
          id: PlayerId.make(uuid()),
          displayName: "Carol",
        });

        const bobSit = sitDown(bob.identity, opened.tableId, bobJoined.player.id, 4);
        const carolSit = sitDown(carol.identity, opened.tableId, carolJoined.player.id, 5);
        expect(yield* bob.push(bobSit)).toEqual(["accepted"]);
        expect(yield* carol.push(carolSit)).toEqual(["accepted"]);

        const noticesCarolSit = yield* api.notified(
          carol.push(setSeat(carol.identity, opened.tableId, carolSit.visitId, 1, 6)),
        );

        expect(noticesCarolSit).toContain(tableScope(opened.tableId));

        expect(
          yield* carol.push(
            setSeat(carol.identity, opened.tableId, bobSit.visitId, 4, 7),
            setTableSeats(carol.identity, opened.tableId, 6, 7),
          ),
        ).toEqual(["forbidden", "forbidden"]);

        expect(
          yield* alice.push(
            recorderCommand(
              "appoint_recorder",
              alice.identity,
              opened.tableId,
              bobJoined.player.id,
            ),
          ),
        ).toEqual(["accepted"]);

        const bobSeat4 = setSeat(bob.identity, opened.tableId, bobSit.visitId, 4, 8);
        expect(yield* bob.push(bobSeat4)).toEqual(["accepted"]);

        expect(yield* bob.push(setTableSeats(bob.identity, opened.tableId, 6, 9))).toEqual([
          "invalid",
        ]);

        const aliceMove2 = setSeat(alice.identity, opened.tableId, opened.visitId, 2, 10, {
          replacesSeatingId: aliceSeat7.seatingId,
          reason: "Typo",
        });

        expect(yield* alice.push(aliceMove2)).toEqual(["accepted"]);

        const resizeNotices = yield* api.notified(
          bob.push(setTableSeats(bob.identity, opened.tableId, 6, 11)),
        );

        expect(resizeNotices).toContain(tableScope(opened.tableId));

        const carolStand = setSeat(bob.identity, opened.tableId, carolSit.visitId, null, 12);
        expect(yield* bob.push(carolStand)).toEqual(["accepted"]);

        const voidNotices = yield* api.notified(
          bob.push(
            voidSeating(bob.identity, opened.tableId, carolSit.visitId, carolStand.seatingId, 13),
          ),
        );

        expect(voidNotices).toContain(tableScope(opened.tableId));

        const aliceHistory = yield* alice.client.recording.history();
        expect(aliceHistory.tables.find((t) => t.id === opened.tableId)?.tableSeats).toBe(6);
        expect(
          aliceHistory.seatings?.some((s) => s.id === aliceSeat7.seatingId && s.voidedAt !== null),
        ).toBe(true);
        expect(
          aliceHistory.seatings?.some((s) => s.id === aliceMove2.seatingId && s.seat === 2),
        ).toBe(true);

        const view = yield* carol.client.recording.table({ params: { tableId: opened.tableId } });
        expect(view.table.tableSeats).toBe(6);
        expect(
          view.seatings
            ?.filter((s) => s.voidedAt === null)
            .map((s) => s.seat)
            .toSorted(),
        ).toEqual([1, 2, 4]);
      }),
  );

  it.effect(
    "rejects only the conflicting set_seat while accepting offline financial commands on the same visit",
    () =>
      Effect.gen(function* () {
        const { starter: alice, opened, token } = yield* sharedTable();
        const bob = yield* device();

        const joined = yield* bob.join(token, { id: PlayerId.make(uuid()), displayName: "Bob" });
        const bobSit = sitDown(bob.identity, opened.tableId, joined.player.id, 4);
        const bobSeat3 = setSeat(bob.identity, opened.tableId, bobSit.visitId, 3, 5);
        expect(yield* bob.push(bobSit, bobSeat3)).toEqual(["accepted", "accepted"]);

        const aliceSeat3 = setSeat(alice.identity, opened.tableId, opened.visitId, 3, 6);
        const aliceBuyIn = addBuyIn(alice.identity, opened.visitId, 0, 5000, 10);
        const aliceFinish = finishAt(alice.identity, opened.visitId, 1, 30000, 20);

        const pushed = yield* alice.client.recording.push({
          payload: {
            identity: alice.identity,
            commands: [aliceSeat3, aliceBuyIn, aliceFinish],
          },
        });

        expect(pushed.results.map((r) => r.status)).toEqual(["rejected", "accepted", "accepted"]);
        expect(pushed.results[0]).toMatchObject({
          status: "rejected",
          reason: "conflict",
          message: "Seat 3 is already taken.",
        });

        const duplicateIdPush = yield* alice.client.recording.push({
          payload: {
            identity: alice.identity,
            commands: [
              setSeat(alice.identity, opened.tableId, opened.visitId, 4, 21, {
                seatingId: bobSeat3.seatingId,
              }),
            ],
          },
        });

        expect(duplicateIdPush.results[0]).toMatchObject({
          status: "rejected",
          reason: "conflict",
          message: "A seating with this ID is already recorded.",
        });

        const view = yield* alice.client.recording.table({ params: { tableId: opened.tableId } });
        const aliceVisit = view.visits.find((v) => v.visit.id === opened.visitId)!;
        expect(aliceVisit.visit.finishedAt).not.toBeNull();
        expect(aliceVisit.totals.buyIn).toBe(25000);
        expect(aliceVisit.totals.cashOut).toBe(30000);
        expect((view.seatings ?? []).filter((s) => s.visitId === opened.visitId)).toEqual([]);
      }),
  );

  it.effect(
    "persists simultaneous multi-spot seatings, conflicts against partial overlaps, shrink guards, and void undo",
    () =>
      Effect.gen(function* () {
        const alice = yield* account("alice_multi");
        const bob = yield* device();

        const opened = start(alice.identity);
        const started = RecordingCommand.make({ ...opened, tableSeats: 6 });
        const aliceSeat1 = setSeat(alice.identity, opened.tableId, opened.visitId, 1, 2);
        const aliceSeat1And6 = setSeat(alice.identity, opened.tableId, opened.visitId, [1, 6], 4);
        expect(yield* alice.push(started, aliceSeat1, aliceSeat1And6)).toEqual([
          "accepted",
          "accepted",
          "accepted",
        ]);

        const { token } = yield* alice.client.recording.share({
          params: { tableId: opened.tableId },
        });

        const bobJoined = yield* bob.join(token, { id: PlayerId.make(uuid()), displayName: "Bob" });
        const bobSit = sitDown(bob.identity, opened.tableId, bobJoined.player.id, 5);
        expect(yield* bob.push(bobSit)).toEqual(["accepted"]);

        const bobMultiConflict = setSeat(bob.identity, opened.tableId, bobSit.visitId, [5, 6], 6);
        const bobBuyIn = addBuyIn(bob.identity, bobSit.visitId, 0, 5000, 7);

        const pushBob = yield* bob.client.recording.push({
          payload: { identity: bob.identity, commands: [bobMultiConflict, bobBuyIn] },
        });

        expect(pushBob.results.map((r) => r.status)).toEqual(["rejected", "accepted"]);
        expect(pushBob.results[0]).toMatchObject({
          reason: "conflict",
          message: "Seat 6 is already taken.",
        });

        expect(yield* alice.push(setTableSeats(alice.identity, opened.tableId, 5, 8))).toEqual([
          "invalid",
        ]);

        const aliceDropTo1 = setSeat(alice.identity, opened.tableId, opened.visitId, 1, 9);
        expect(yield* alice.push(aliceDropTo1)).toEqual(["accepted"]);

        expect(yield* alice.push(setTableSeats(alice.identity, opened.tableId, 5, 10))).toEqual([
          "accepted",
        ]);

        const bobHistory = yield* bob.client.recording.table({
          params: { tableId: opened.tableId },
        });

        const multiRow = (bobHistory.seatings ?? []).find((s) => s.id === aliceSeat1And6.seatingId);
        expect(multiRow).toMatchObject({ seat: null, seats: [1, 6] });

        const history = yield* alice.client.recording.history();
        const expanded = history.seatings?.find((s) => s.id === aliceSeat1And6.seatingId);
        expect(expanded).toMatchObject({ seat: null, seats: [1, 6] });

        expect(
          yield* alice.push(
            voidSeating(alice.identity, opened.tableId, opened.visitId, aliceDropTo1.seatingId, 11),
          ),
        ).toEqual(["invalid"]);
      }),
  );
});
