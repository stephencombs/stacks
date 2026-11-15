import { expect, it } from "@effect/vitest";
import { EntryId, MinorUnits, PlayerId, PlayerIdentity, VisitId } from "@stacks/contracts";
import { RecordingCommand, RecordingOperationId } from "@stacks/contracts/recordingCommands";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";

import { applyRecordingCommand, ownPlayers, type RecordingLedger } from "./recording.ts";
import { ACTOR, BEA, visit } from "./testing/recording.ts";
import { visitSummary } from "./visits.ts";

let sequence = 100;
const uuid = () => `0192e7a0-0000-7000-8000-${(sequence++).toString(16).padStart(12, "0")}`;
const at = (minute: number) => DateTime.makeUnsafe(Date.UTC(2026, 10, 6, 22, minute));
const common = () => ({
  operationId: RecordingOperationId.make(uuid()),
  actorId: ACTOR,
  preparedAt: at(30),
});
const initial = (): RecordingLedger => {
  const self = PlayerIdentity.make({ id: visit.playerId, displayName: "Alex" });
  return {
    self,
    actor: { id: ACTOR, userId: null },
    players: [self],
    participants: [],
    recorders: [],
    tables: [],
    visits: [],
    entries: [],
    receipts: [],
  };
};
const opened = (buyIn = 20000, finished = false) =>
  applyRecordingCommand(
    initial(),
    RecordingCommand.make({
      ...common(),
      tableId: visit.tableId,
      visitId: visit.id,
      playerId: visit.playerId,
      buyInId: EntryId.make(uuid()),
      buyIn: MinorUnits.make(buyIn),
      startedAt: at(0),
      game: null,
      venueId: null,
      highLimit: false,
      ...(finished
        ? {
            type: "record_completed",
            cashOutId: EntryId.make(uuid()),
            cashOut: MinorUnits.make(35000),
            finishedAt: at(20),
          }
        : { type: "start" }),
    }),
  );
const change = (
  state: RecordingLedger,
  type: "delete_visit" | "restore_visit",
  visitId = visit.id,
) =>
  applyRecordingCommand(
    state,
    RecordingCommand.make({
      ...common(),
      type,
      visitId,
      expectedRevision: state.visits.find((v) => v.id === visitId)!.revision,
    }),
  );

it.prop(
  "restores exact financial facts and totals across repeated delete/restore cycles",
  [
    MinorUnits.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })),
    Schema.Boolean,
  ],
  ([amount, finished]) => {
    const before = opened(amount, finished);
    let state = before;
    for (let cycle = 0; cycle < 3; cycle++) {
      const deleted = change(state, "delete_visit");
      expect(deleted.entries.every((entry) => entry.voidedAt !== null)).toBe(true);
      expect(visitSummary(deleted.visits[0]!, deleted.entries).totals).toEqual({
        buyIn: 0,
        cashOut: 0,
        adjustment: 0,
      });
      state = change(deleted, "restore_visit");
      expect(state.entries).toEqual(before.entries);
      expect(visitSummary(state.visits[0]!, state.entries).totals).toEqual(
        visitSummary(before.visits[0]!, before.entries).totals,
      );
      expect(visitSummary(state.visits[0]!, state.entries).finalResult).toEqual(
        visitSummary(before.visits[0]!, before.entries).finalResult,
      );
    }
  },
);

it("touches only your visit and refuses starter and recorder authority over someone else's deletion", () => {
  const before = opened();
  const joined = {
    ...common(),
    type: "join_table",
    tableId: visit.tableId,
    visitId: VisitId.make(uuid()),
    playerId: BEA,
    newPlayer: { id: BEA, displayName: "Bea" },
    buyInId: EntryId.make(uuid()),
    buyIn: MinorUnits.make(10000),
    startedAt: at(5),
    counterpartyId: visit.playerId,
  } satisfies RecordingCommand;
  const shared = applyRecordingCommand(before, joined);
  expect(() => change(shared, "delete_visit", joined.visitId)).toThrow("only your own");
  const deleted = change(shared, "delete_visit");
  expect(deleted.visits[1]).toEqual(shared.visits[1]);
  expect(deleted.entries[1]).toEqual(shared.entries[1]);
  const recorder = {
    ...shared,
    self: PlayerIdentity.make({ id: PlayerId.make(uuid()), displayName: "Recorder" }),
  };
  expect(() =>
    change(
      { ...recorder, recorders: [{ tableId: visit.tableId, playerId: recorder.self.id }] },
      "delete_visit",
    ),
  ).toThrow("only your own");
});

it("does not mistake a recorder's fetched participants for players it owns offline", () => {
  const before = opened();
  const seat = {
    ...common(),
    type: "join_table",
    tableId: visit.tableId,
    visitId: VisitId.make(uuid()),
    playerId: BEA,
    newPlayer: { id: BEA, displayName: "Bea" },
    buyInId: EntryId.make(uuid()),
    buyIn: MinorUnits.make(10000),
    startedAt: at(5),
  } satisfies RecordingCommand;
  const shared = applyRecordingCommand(before, seat);
  const self = PlayerIdentity.make({ id: PlayerId.make(uuid()), displayName: "Recorder" });
  const recorder = {
    ...shared,
    self,
    participants: [
      { tableId: visit.tableId, playerId: self.id },
      { tableId: visit.tableId, playerId: BEA },
    ],
    recorders: [{ tableId: visit.tableId, playerId: self.id }],
  };
  expect(ownPlayers(recorder)).toEqual([self.id]);
  expect(() => change(recorder, "delete_visit", seat.visitId)).toThrow("only your own");
  const deleted = applyRecordingCommand(
    recorder,
    {
      ...common(),
      type: "delete_visit",
      visitId: seat.visitId,
      expectedRevision: 0,
    },
    null,
  );
  expect(() => change(deleted, "restore_visit", seat.visitId)).toThrow("only your own");
});

it("refuses recording into a deleted visit and refuses imported history", () => {
  const before = opened();
  const deleted = change(before, "delete_visit");
  expect(() => change(deleted, "delete_visit")).toThrow("Restore this session");
  expect(() => change(before, "restore_visit")).toThrow("isn't deleted");
  expect(() => change({ ...before, receipts: [] }, "delete_visit")).toThrow("Imported history");
  expect(() =>
    applyRecordingCommand(
      deleted,
      RecordingCommand.make({
        ...common(),
        type: "edit_visit",
        visitId: visit.id,
        expectedRevision: 1,
        startedAt: at(0),
      }),
    ),
  ).toThrow("Restore this session");
  expect(() =>
    applyRecordingCommand(
      deleted,
      RecordingCommand.make({
        ...common(),
        type: "add",
        visitId: visit.id,
        expectedRevision: 1,
        entryId: EntryId.make(uuid()),
        kind: "buy_in",
        amount: MinorUnits.make(100),
        occurredAt: at(1),
        note: null,
      }),
    ),
  ).toThrow("Restore this session");
});

it("does not restore a live visit over another live return visit", () => {
  const deleted = change(opened(), "delete_visit");
  const returned = applyRecordingCommand(
    deleted,
    RecordingCommand.make({
      ...common(),
      type: "join_table",
      tableId: visit.tableId,
      visitId: VisitId.make(uuid()),
      playerId: visit.playerId,
      buyInId: EntryId.make(uuid()),
      buyIn: MinorUnits.make(100),
      startedAt: at(10),
    }),
  );
  expect(() => change(returned, "restore_visit")).toThrow("already playing");
  expect(returned.entries[0]!.voidedAt).not.toBeNull();
});

it.prop(
  "preserves corrections, reopened cash-outs and counterparties through deletion",
  [
    Schema.Array(
      Schema.Struct({
        kind: Schema.Literals(["buy_in", "cash_out"]),
        amount: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000000 })),
        correct: Schema.Boolean,
        replace: Schema.Boolean,
      }),
    ).check(Schema.isMaxLength(8)),
    Schema.Boolean,
  ],
  ([facts, finishAgain]) => {
    let state = opened();
    state = applyRecordingCommand(state, {
      ...common(),
      type: "join_table",
      tableId: visit.tableId,
      visitId: VisitId.make(uuid()),
      playerId: BEA,
      newPlayer: { id: BEA, displayName: "Bea" },
      buyInId: EntryId.make(uuid()),
      buyIn: MinorUnits.make(10000),
      startedAt: at(1),
    });
    const apply = (command: RecordingCommand) => {
      state = applyRecordingCommand(state, command);
    };
    const revision = () => state.visits[0]!.revision;
    for (const fact of facts) {
      const id = EntryId.make(uuid());
      apply({
        ...common(),
        type: "add",
        visitId: visit.id,
        expectedRevision: revision(),
        entryId: id,
        kind: fact.kind,
        amount: MinorUnits.make(fact.amount),
        occurredAt: at(10),
        note: "Paid by Bea",
        counterpartyId: BEA,
      });
      if (fact.correct)
        apply({
          ...common(),
          type: "correct",
          visitId: visit.id,
          expectedRevision: revision(),
          entryId: id,
          reason: "Correction",
          replacement: fact.replace
            ? {
                id: EntryId.make(uuid()),
                amount: MinorUnits.make(fact.amount),
                occurredAt: at(10),
                note: null,
                counterpartyId: BEA,
              }
            : null,
        });
    }
    const cashOut = EntryId.make(uuid());
    apply({
      ...common(),
      type: "finish",
      visitId: visit.id,
      expectedRevision: revision(),
      entryId: cashOut,
      amount: MinorUnits.make(30000),
      finishedAt: at(20),
      counterpartyId: BEA,
    });
    apply({
      ...common(),
      type: "correct",
      visitId: visit.id,
      expectedRevision: revision(),
      entryId: cashOut,
      reason: "Recounted",
      replacement: {
        id: EntryId.make(uuid()),
        amount: MinorUnits.make(35000),
        occurredAt: at(20),
        note: null,
      },
    });
    apply({
      ...common(),
      type: "reopen",
      visitId: visit.id,
      expectedRevision: revision(),
      reason: "Still playing",
    });
    if (finishAgain)
      apply({
        ...common(),
        type: "finish",
        visitId: visit.id,
        expectedRevision: revision(),
        entryId: EntryId.make(uuid()),
        amount: MinorUnits.make(40000),
        finishedAt: at(25),
      });
    const before = state;
    for (let cycle = 0; cycle < 2; cycle++) {
      state = change(state, "delete_visit");
      expect(
        state.entries
          .filter((entry) => entry.visitId === visit.id)
          .every((entry) => entry.voidedAt !== null),
      ).toBe(true);
      expect(state.entries.filter((entry) => entry.visitId !== visit.id)).toEqual(
        before.entries.filter((entry) => entry.visitId !== visit.id),
      );
      state = change(state, "restore_visit");
      expect(state.entries).toEqual(before.entries);
      expect(visitSummary(state.visits[0]!, state.entries)).toEqual({
        ...visitSummary(before.visits[0]!, before.entries),
        visit: state.visits[0],
      });
    }
  },
);

it("moves a whole table between trips and back to personal without changing play", () => {
  const before = applyRecordingCommand(
    opened(20000, true),
    RecordingCommand.make({
      ...common(),
      type: "join_table",
      tableId: visit.tableId,
      visitId: VisitId.make(uuid()),
      playerId: visit.playerId,
      buyInId: EntryId.make(uuid()),
      buyIn: MinorUnits.make(10000),
      startedAt: at(30),
    }),
  );
  expect(before.visits).toHaveLength(2);
  const setTrip = (state: RecordingLedger, tripId: string | null) =>
    applyRecordingCommand(
      state,
      Schema.decodeUnknownSync(RecordingCommand)({
        ...common(),
        type: "set_table_trip",
        tableId: visit.tableId,
        tripId,
      }),
    );
  const first = uuid();
  const second = uuid();
  const attached = setTrip(before, first);
  expect(attached.tables[0]!.tripId).toBe(first);
  const moved = setTrip(attached, second);
  expect(moved.tables[0]!.tripId).toBe(second);
  const cleared = setTrip(moved, null);
  expect(cleared.tables[0]!.tripId).toBeNull();
  for (const state of [attached, moved, cleared]) {
    expect(state.visits).toEqual(before.visits);
    expect(state.entries).toEqual(before.entries);
    expect(visitSummary(state.visits[0]!, state.entries).finalResult).toBe(15000);
  }
  expect(() =>
    applyRecordingCommand(
      before,
      Schema.decodeUnknownSync(RecordingCommand)({
        ...common(),
        type: "set_table_trip",
        tableId: visit.tableId,
        tripId: first,
      }),
      [BEA],
    ),
  ).toThrow("Only the player who started this table");
});

it("opens a table without playing, records for the players added there, and deletes it only while nobody has played", () => {
  const open = {
    ...common(),
    type: "open_table",
    tableId: visit.tableId,
    playerId: visit.playerId,
    game: null,
    venueId: null,
    highLimit: false,
  } satisfies RecordingCommand;
  expect(() => applyRecordingCommand(initial(), { ...open, playerId: BEA })).toThrow(
    "Start a table as yourself",
  );
  const empty = applyRecordingCommand(initial(), open);
  expect(empty.tables).toEqual([
    {
      id: visit.tableId,
      tripId: null,
      game: null,
      venueId: null,
      highLimit: false,
      starterPlayerId: visit.playerId,
    },
  ]);
  expect(empty.visits).toEqual([]);
  expect(() => applyRecordingCommand(empty, open)).toThrow("Start IDs are already used");
  // A recorder's device gets the table with its history, then replays the opening.
  expect(applyRecordingCommand(empty, open, null).tables).toEqual(empty.tables);

  const seat = {
    ...common(),
    type: "join_table",
    tableId: visit.tableId,
    visitId: VisitId.make(uuid()),
    playerId: BEA,
    newPlayer: { id: BEA, displayName: "Bea" },
    buyInId: EntryId.make(uuid()),
    buyIn: MinorUnits.make(10000),
    startedAt: at(5),
  } satisfies RecordingCommand;
  const seated = applyRecordingCommand(empty, seat);
  const finished = applyRecordingCommand(
    seated,
    RecordingCommand.make({
      ...common(),
      type: "finish",
      visitId: seat.visitId,
      expectedRevision: 0,
      entryId: EntryId.make(uuid()),
      amount: MinorUnits.make(25000),
      finishedAt: at(20),
    }),
  );
  expect(visitSummary(finished.visits[0]!, finished.entries).finalResult).toBe(15000);

  const remove = (state: RecordingLedger, actorPlayers?: ReadonlyArray<PlayerId>) =>
    applyRecordingCommand(
      state,
      RecordingCommand.make({ ...common(), type: "delete_table", tableId: visit.tableId }),
      actorPlayers,
    );
  expect(() => remove(finished)).toThrow("Someone has played at this table");
  expect(() => remove(empty, [BEA])).toThrow("Only the player who started this table");
  const deleted = remove(empty);
  expect(deleted.tables[0]!.deletedAt).toEqual(at(30));
  // Deleting takes the table out of its trip, so the trip holds nothing of it.
  const inTrip = applyRecordingCommand(
    empty,
    Schema.decodeUnknownSync(RecordingCommand)({
      ...common(),
      type: "set_table_trip",
      tableId: visit.tableId,
      tripId: uuid(),
    }),
  );
  expect(remove(inTrip).tables[0]!.tripId).toBeNull();
  expect(() => remove(deleted)).toThrow("This table was deleted");
  expect(() => applyRecordingCommand(deleted, seat)).toThrow("This table was deleted");
});

it("keeps a table someone played at, even after they deleted their visit, and restores nothing into a deleted table", () => {
  const open = {
    ...common(),
    type: "open_table",
    tableId: visit.tableId,
    playerId: visit.playerId,
    game: null,
    venueId: null,
    highLimit: false,
  } satisfies RecordingCommand;
  const sat = {
    ...common(),
    type: "join_table",
    tableId: visit.tableId,
    visitId: visit.id,
    playerId: visit.playerId,
    buyInId: EntryId.make(uuid()),
    buyIn: MinorUnits.make(10000),
    startedAt: at(5),
  } satisfies RecordingCommand;
  const played = change(
    applyRecordingCommand(applyRecordingCommand(initial(), open), sat),
    "delete_visit",
  );
  expect(() =>
    applyRecordingCommand(
      played,
      RecordingCommand.make({ ...common(), type: "delete_table", tableId: visit.tableId }),
    ),
  ).toThrow("Someone has played at this table");
  // However it came to be deleted, a deleted table takes no visit back.
  const gone = {
    ...played,
    tables: played.tables.map((table) => ({ ...table, deletedAt: at(40) })),
  };
  expect(() => change(gone, "restore_visit")).toThrow("This table was deleted");
});
