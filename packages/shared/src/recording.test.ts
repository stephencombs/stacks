import { expect, it } from "@effect/vitest";
import {
  ActorId,
  EntryId,
  MinorUnits,
  PlayerId,
  PlayerIdentity,
  SeatingId,
  TableId,
  Visit,
  VisitId,
} from "@stacks/contracts";
import { RecordingCommand, RecordingOperationId } from "@stacks/contracts/recordingCommands";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";

import { applyRecordingCommand, ownPlayers, type RecordingLedger } from "./recording.ts";
import { seatCount, tableLiveSeats, visitSeatsNow } from "./seats.ts";
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

const initial: () => RecordingLedger = () => {
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
    seatings: [],
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

  const gone = {
    ...played,
    tables: played.tables.map((table) => ({ ...table, deletedAt: at(40) })),
  };

  expect(() => change(gone, "restore_visit")).toThrow("This table was deleted");
});

it("stores a trimmed custom game name only for Other and enforces the 60-character cap", () => {
  const custom = applyRecordingCommand(
    initial(),
    RecordingCommand.make({
      ...common(),
      type: "start",
      tableId: visit.tableId,
      visitId: visit.id,
      playerId: visit.playerId,
      buyInId: EntryId.make(uuid()),
      buyIn: MinorUnits.make(20000),
      startedAt: at(0),
      game: "other",
      gameName: "  Pai Gow Tiles  ",
      venueId: null,
      highLimit: false,
    }),
  );

  expect(custom.tables[0]?.gameName).toBe("Pai Gow Tiles");

  const switched = applyRecordingCommand(
    custom,
    RecordingCommand.make({
      ...common(),
      type: "edit_visit",
      visitId: visit.id,
      expectedRevision: 0,
      table: { game: "blackjack", gameName: "Pai Gow Tiles", venueId: null, highLimit: false },
    }),
  );

  expect(switched.tables[0]?.gameName).toBeUndefined();

  expect(() =>
    applyRecordingCommand(
      initial(),
      RecordingCommand.make({
        ...common(),
        type: "open_table",
        tableId: TableId.make(uuid()),
        playerId: visit.playerId,
        game: "other",
        gameName: "x".repeat(61),
        venueId: null,
        highLimit: false,
      }),
    ),
  ).toThrow("Keep the game name to 60 characters.");
});

it("normalizes tableSeats on table creation, supports set_table_seats permissions, and blocks shrinking under occupied seats", () => {
  const bj = applyRecordingCommand(
    initial(),
    RecordingCommand.make({
      ...common(),
      type: "start",
      tableId: visit.tableId,
      visitId: visit.id,
      playerId: visit.playerId,
      buyInId: EntryId.make(uuid()),
      buyIn: MinorUnits.make(20000),
      startedAt: at(0),
      game: "blackjack",
      tableSeats: 7,
      venueId: null,
      highLimit: false,
    }),
  );

  expect(bj.tables[0]?.tableSeats).toBe(7);
  expect(seatCount(bj.tables[0]!)).toBe(7);

  expect(() =>
    applyRecordingCommand(
      initial(),
      RecordingCommand.make({
        ...common(),
        type: "open_table",
        tableId: TableId.make(uuid()),
        playerId: visit.playerId,
        game: "blackjack",
        tableSeats: 4,
        venueId: null,
        highLimit: false,
      }),
    ),
  ).toThrow("Choose 5, 6, 7 seats for blackjack.");

  const poker: RecordingLedger = applyRecordingCommand(
    initial(),
    RecordingCommand.make({
      ...common(),
      type: "record_completed",
      tableId: TableId.make(uuid()),
      visitId: VisitId.make(uuid()),
      playerId: visit.playerId,
      buyInId: EntryId.make(uuid()),
      buyIn: MinorUnits.make(10000),
      cashOutId: EntryId.make(uuid()),
      cashOut: MinorUnits.make(15000),
      startedAt: at(0),
      finishedAt: at(10),
      game: "poker_cash",
      tableSeats: 6,
      venueId: null,
      highLimit: false,
    }),
  );

  expect(poker.tables[0]?.tableSeats).toBeUndefined();

  expect(() =>
    applyRecordingCommand(
      poker,
      RecordingCommand.make({
        ...common(),
        type: "set_table_seats",
        tableId: poker.tables[0]!.id,
        tableSeats: 6,
      }),
    ),
  ).toThrow("This game doesn't use numbered seats.");

  const calId = PlayerId.make(uuid());
  const beaVisitId = VisitId.make(uuid());
  const calVisitId = VisitId.make(uuid());

  const withBea = applyRecordingCommand(
    applyRecordingCommand(
      bj,
      RecordingCommand.make({
        ...common(),
        type: "join_table",
        tableId: visit.tableId,
        visitId: beaVisitId,
        playerId: BEA,
        newPlayer: { id: BEA, displayName: "Bea" },
        buyInId: EntryId.make(uuid()),
        buyIn: MinorUnits.make(10000),
        startedAt: at(2),
      }),
    ),
    RecordingCommand.make({
      ...common(),
      type: "join_table",
      tableId: visit.tableId,
      visitId: calVisitId,
      playerId: calId,
      newPlayer: { id: calId, displayName: "Cal" },
      buyInId: EntryId.make(uuid()),
      buyIn: MinorUnits.make(10000),
      startedAt: at(3),
    }),
  );

  const beaActor = ActorId.make(uuid());
  const calActor = ActorId.make(uuid());

  const seated: RecordingLedger = applyRecordingCommand(
    withBea,
    RecordingCommand.make({
      ...common(),
      type: "set_seat",
      tableId: visit.tableId,
      visitId: beaVisitId,
      seatingId: SeatingId.make(uuid()),
      seat: 7,
      occurredAt: at(4),
    }),
  );

  const appointed: RecordingLedger = applyRecordingCommand(
    seated,
    RecordingCommand.make({
      ...common(),
      type: "appoint_recorder",
      tableId: visit.tableId,
      playerId: BEA,
    }),
  );

  expect(() =>
    applyRecordingCommand(
      { ...appointed, actor: { id: calActor, userId: null } },
      RecordingCommand.make({
        ...common(),
        actorId: calActor,
        type: "set_table_seats",
        tableId: visit.tableId,
        tableSeats: 6,
      }),
      [calId],
    ),
  ).toThrow("Only whoever records for everyone at this table can change its size.");

  expect(() =>
    applyRecordingCommand(
      { ...appointed, actor: { id: beaActor, userId: null } },
      RecordingCommand.make({
        ...common(),
        actorId: beaActor,
        type: "set_table_seats",
        tableId: visit.tableId,
        tableSeats: 5,
      }),
      [BEA],
    ),
  ).toThrow("Move anyone sitting past seat 5 before shrinking the table.");

  const stood: RecordingLedger = applyRecordingCommand(
    { ...appointed, actor: { id: beaActor, userId: null } },
    RecordingCommand.make({
      ...common(),
      actorId: beaActor,
      type: "set_seat",
      tableId: visit.tableId,
      visitId: beaVisitId,
      seatingId: SeatingId.make(uuid()),
      seat: null,
      occurredAt: at(6),
    }),
    [BEA],
  );

  const shrunk: RecordingLedger = applyRecordingCommand(
    stood,
    RecordingCommand.make({
      ...common(),
      actorId: beaActor,
      type: "set_table_seats",
      tableId: visit.tableId,
      tableSeats: 5,
    }),
    [BEA],
  );

  expect(shrunk.tables[0]?.tableSeats).toBe(5);
});

it("manages set_seat and void_seating without bumping visit.revision and checks permissions, bounds, and conflicts", () => {
  const beaVisitId = VisitId.make(uuid());
  const calId = PlayerId.make(uuid());
  const calVisitId = VisitId.make(uuid());
  const beaActor = ActorId.make(uuid());
  const calActor = ActorId.make(uuid());

  const table = applyRecordingCommand(
    applyRecordingCommand(
      applyRecordingCommand(
        initial(),
        RecordingCommand.make({
          ...common(),
          type: "start",
          tableId: visit.tableId,
          visitId: visit.id,
          playerId: visit.playerId,
          buyInId: EntryId.make(uuid()),
          buyIn: MinorUnits.make(20000),
          startedAt: at(5),
          game: "blackjack",
          venueId: null,
          highLimit: false,
        }),
      ),
      RecordingCommand.make({
        ...common(),
        type: "join_table",
        tableId: visit.tableId,
        visitId: beaVisitId,
        playerId: BEA,
        newPlayer: { id: BEA, displayName: "Bea" },
        buyInId: EntryId.make(uuid()),
        buyIn: MinorUnits.make(10000),
        startedAt: at(5),
      }),
    ),
    RecordingCommand.make({
      ...common(),
      type: "join_table",
      tableId: visit.tableId,
      visitId: calVisitId,
      playerId: calId,
      newPlayer: { id: calId, displayName: "Cal" },
      buyInId: EntryId.make(uuid()),
      buyIn: MinorUnits.make(10000),
      startedAt: at(5),
    }),
  );

  expect(() =>
    applyRecordingCommand(
      table,
      RecordingCommand.make({
        ...common(),
        type: "set_seat",
        tableId: visit.tableId,
        visitId: visit.id,
        seatingId: SeatingId.make(uuid()),
        seat: 6,
        occurredAt: at(6),
      }),
    ),
  ).toThrow("Choose a seat from 1 to 5.");

  expect(() =>
    applyRecordingCommand(
      table,
      RecordingCommand.make({
        ...common(),
        type: "set_seat",
        tableId: visit.tableId,
        visitId: visit.id,
        seatingId: SeatingId.make(uuid()),
        seat: 2,
        occurredAt: at(4),
      }),
    ),
  ).toThrow("Seat time must stay within the session.");

  const seat2Id = SeatingId.make(uuid());

  const sat = applyRecordingCommand(
    table,
    RecordingCommand.make({
      ...common(),
      type: "set_seat",
      tableId: visit.tableId,
      visitId: visit.id,
      seatingId: seat2Id,
      seat: 2,
      occurredAt: at(6),
    }),
  );

  expect(sat.visits.find((v) => v.id === visit.id)!.revision).toBe(0);

  const rebuyAfterSeat = applyRecordingCommand(
    sat,
    RecordingCommand.make({
      ...common(),
      type: "add",
      visitId: visit.id,
      expectedRevision: 0,
      entryId: EntryId.make(uuid()),
      kind: "buy_in",
      amount: MinorUnits.make(5000),
      occurredAt: at(7),
      note: null,
    }),
  );

  expect(rebuyAfterSeat.visits.find((v) => v.id === visit.id)!.revision).toBe(1);

  const tableParticipants = [
    { tableId: visit.tableId, playerId: BEA },
    { tableId: visit.tableId, playerId: calId },
  ];

  expect(() =>
    applyRecordingCommand(
      { ...rebuyAfterSeat, actor: { id: calActor, userId: null }, participants: tableParticipants },
      RecordingCommand.make({
        ...common(),
        actorId: calActor,
        type: "set_seat",
        tableId: visit.tableId,
        visitId: beaVisitId,
        seatingId: SeatingId.make(uuid()),
        seat: 1,
        occurredAt: at(8),
      }),
      [calId],
    ),
  ).toThrow("You can record only your own play at this table.");

  expect(() =>
    applyRecordingCommand(
      { ...rebuyAfterSeat, actor: { id: beaActor, userId: null }, participants: tableParticipants },
      RecordingCommand.make({
        ...common(),
        actorId: beaActor,
        type: "set_seat",
        tableId: visit.tableId,
        visitId: beaVisitId,
        seatingId: SeatingId.make(uuid()),
        seat: 2,
        occurredAt: at(8),
      }),
      [BEA],
    ),
  ).toThrow("Seat 2 is already taken.");

  const seat4Id = SeatingId.make(uuid());

  const replaced: RecordingLedger = applyRecordingCommand(
    rebuyAfterSeat,
    RecordingCommand.make({
      ...common(),
      preparedAt: at(31),
      type: "set_seat",
      tableId: visit.tableId,
      visitId: visit.id,
      seatingId: seat4Id,
      seat: 4,
      occurredAt: at(8),
      replacesSeatingId: seat2Id,
      reason: "Misread seat",
    }),
  );

  expect(visitSeatsNow(replaced.seatings.filter((s) => s.visitId === visit.id))).toEqual([4]);
  expect(replaced.seatings.find((s) => s.id === seat2Id)?.voidedAt).toEqual(at(31));

  const movedAlexTo3: RecordingLedger = applyRecordingCommand(
    replaced,
    RecordingCommand.make({
      ...common(),
      preparedAt: at(32),
      type: "set_seat",
      tableId: visit.tableId,
      visitId: visit.id,
      seatingId: SeatingId.make(uuid()),
      seat: 3,
      occurredAt: at(9),
    }),
  );

  const movedBeaTo1: RecordingLedger = applyRecordingCommand(
    movedAlexTo3,
    RecordingCommand.make({
      ...common(),
      preparedAt: at(33),
      type: "set_seat",
      tableId: visit.tableId,
      visitId: beaVisitId,
      seatingId: SeatingId.make(uuid()),
      seat: 1,
      occurredAt: at(10),
    }),
  );

  const beaTook4: RecordingLedger = applyRecordingCommand(
    movedBeaTo1,
    RecordingCommand.make({
      ...common(),
      preparedAt: at(34),
      type: "set_seat",
      tableId: visit.tableId,
      visitId: beaVisitId,
      seatingId: SeatingId.make(uuid()),
      seat: 4,
      occurredAt: at(11),
    }),
  );

  const alexLastSeating = beaTook4.seatings.findLast(
    (s) => s.visitId === visit.id && s.voidedAt === null,
  )!;

  expect(() =>
    applyRecordingCommand(
      beaTook4,
      RecordingCommand.make({
        ...common(),
        preparedAt: at(35),
        type: "void_seating",
        tableId: visit.tableId,
        visitId: visit.id,
        seatingId: alexLastSeating.id,
        reason: "Undo seat 3",
      }),
    ),
  ).toThrow("Seat 4 is already taken.");
});

it("enforces start/finish bounds on seatings, clears tableSeats on game change, handles reopen overlaps, and replays safely on server", () => {
  const beaVisitId = VisitId.make(uuid());

  const bj: RecordingLedger = applyRecordingCommand(
    applyRecordingCommand(
      initial(),
      RecordingCommand.make({
        ...common(),
        type: "start",
        tableId: visit.tableId,
        visitId: visit.id,
        playerId: visit.playerId,
        buyInId: EntryId.make(uuid()),
        buyIn: MinorUnits.make(20000),
        startedAt: at(5),
        game: "blackjack",
        tableSeats: 7,
        venueId: null,
        highLimit: false,
      }),
    ),
    RecordingCommand.make({
      ...common(),
      type: "join_table",
      tableId: visit.tableId,
      visitId: beaVisitId,
      playerId: BEA,
      newPlayer: { id: BEA, displayName: "Bea" },
      buyInId: EntryId.make(uuid()),
      buyIn: MinorUnits.make(10000),
      startedAt: at(2),
    }),
  );

  const earlierStart: RecordingLedger = applyRecordingCommand(
    bj,
    RecordingCommand.make({
      ...common(),
      type: "edit_visit",
      visitId: visit.id,
      expectedRevision: 0,
      startedAt: at(0),
    }),
  );

  const alexSit = RecordingCommand.make({
    ...common(),
    preparedAt: at(3),
    type: "set_seat",
    tableId: visit.tableId,
    visitId: visit.id,
    seatingId: SeatingId.make(uuid()),
    seat: 7,
    occurredAt: at(3),
  });

  const withSit: RecordingLedger = applyRecordingCommand(earlierStart, alexSit);

  expect(() =>
    applyRecordingCommand(
      withSit,
      RecordingCommand.make({
        ...common(),
        type: "edit_visit",
        visitId: visit.id,
        expectedRevision: 1,
        startedAt: at(4),
      }),
    ),
  ).toThrow("The start time can't be after a recorded seat.");

  const replacedSit: RecordingLedger = applyRecordingCommand(
    withSit,
    RecordingCommand.make({
      ...common(),
      preparedAt: at(6),
      type: "set_seat",
      tableId: visit.tableId,
      visitId: visit.id,
      seatingId: SeatingId.make(uuid()),
      seat: 7,
      occurredAt: at(6),
      replacesSeatingId: withSit.seatings[0]!.id,
      reason: "Moved later",
    }),
  );

  const editedAfterVoid: RecordingLedger = applyRecordingCommand(
    replacedSit,
    RecordingCommand.make({
      ...common(),
      type: "edit_visit",
      visitId: visit.id,
      expectedRevision: 1,
      startedAt: at(4),
    }),
  );

  expect(() =>
    applyRecordingCommand(
      editedAfterVoid,
      RecordingCommand.make({
        ...common(),
        type: "finish",
        visitId: visit.id,
        expectedRevision: 2,
        entryId: EntryId.make(uuid()),
        amount: MinorUnits.make(15000),
        finishedAt: at(5),
      }),
    ),
  ).toThrow("Finish time can't be before a recorded seat.");

  const finished: RecordingLedger = applyRecordingCommand(
    editedAfterVoid,
    RecordingCommand.make({
      ...common(),
      type: "finish",
      visitId: visit.id,
      expectedRevision: 2,
      entryId: EntryId.make(uuid()),
      amount: MinorUnits.make(15000),
      finishedAt: at(10),
    }),
  );

  const shrunkToPoker: RecordingLedger = applyRecordingCommand(
    finished,
    RecordingCommand.make({
      ...common(),
      type: "edit_visit",
      visitId: visit.id,
      expectedRevision: 3,
      table: { game: "poker_cash", venueId: null, highLimit: false },
    }),
  );

  expect(shrunkToPoker.tables[0]?.tableSeats).toBeUndefined();

  const beaOn7: RecordingLedger = applyRecordingCommand(
    finished,
    RecordingCommand.make({
      ...common(),
      preparedAt: at(12),
      type: "set_seat",
      tableId: visit.tableId,
      visitId: beaVisitId,
      seatingId: SeatingId.make(uuid()),
      seat: 7,
      occurredAt: at(12),
    }),
  );

  const reopened = applyRecordingCommand(
    beaOn7,
    RecordingCommand.make({
      ...common(),
      preparedAt: at(35),
      type: "reopen",
      visitId: visit.id,
      expectedRevision: 3,
      reason: "Reopened",
    }),
  );

  expect(tableLiveSeats(reopened.visits, reopened.seatings).get(7)).toBe(beaVisitId);

  const foreignPokerTable = {
    ...shrunkToPoker.tables[0]!,
    starterPlayerId: BEA,
  };

  const replayVisit = Visit.make({
    ...shrunkToPoker.visits[0]!,
    startedAt: at(0),
    finishedAt: at(10),
  });

  const replayed = applyRecordingCommand(
    { ...initial(), tables: [foreignPokerTable], visits: [replayVisit] },
    alexSit,
    null,
  );

  expect(replayed.seatings).toHaveLength(1);

  const expand1And2 = applyRecordingCommand(
    bj,
    RecordingCommand.make({
      ...common(),
      preparedAt: at(6),
      type: "set_seat",
      tableId: visit.tableId,
      visitId: visit.id,
      seatingId: SeatingId.make(uuid()),
      seat: null,
      seats: [1, 2],
      occurredAt: at(6),
    }),
  );

  expect(visitSeatsNow(expand1And2.seatings.filter((s) => s.visitId === visit.id))).toEqual([1, 2]);
  expect([...tableLiveSeats(expand1And2.visits, expand1And2.seatings)]).toEqual([
    [1, visit.id],
    [2, visit.id],
  ]);

  expect(() =>
    applyRecordingCommand(
      expand1And2,
      RecordingCommand.make({
        ...common(),
        preparedAt: at(7),
        type: "set_seat",
        tableId: visit.tableId,
        visitId: beaVisitId,
        seatingId: SeatingId.make(uuid()),
        seat: null,
        seats: [2, 3],
        occurredAt: at(7),
      }),
    ),
  ).toThrow("Seat 2 is already taken.");

  const withSix: RecordingLedger = applyRecordingCommand(
    expand1And2,
    RecordingCommand.make({
      ...common(),
      preparedAt: at(8),
      type: "set_seat",
      tableId: visit.tableId,
      visitId: visit.id,
      seatingId: SeatingId.make(uuid()),
      seat: null,
      seats: [1, 6],
      occurredAt: at(8),
    }),
  );

  expect(() =>
    applyRecordingCommand(
      withSix,
      RecordingCommand.make({
        ...common(),
        preparedAt: at(9),
        type: "set_table_seats",
        tableId: visit.tableId,
        tableSeats: 5,
      }),
    ),
  ).toThrow("Move anyone sitting past seat 5 before shrinking the table.");

  const beaOn4And5: RecordingLedger = applyRecordingCommand(
    withSix,
    RecordingCommand.make({
      ...common(),
      preparedAt: at(10),
      type: "set_seat",
      tableId: visit.tableId,
      visitId: beaVisitId,
      seatingId: SeatingId.make(uuid()),
      seat: null,
      seats: [4, 5],
      occurredAt: at(10),
    }),
  );

  const shrunkTo1: RecordingLedger = applyRecordingCommand(
    beaOn4And5,
    RecordingCommand.make({
      ...common(),
      preparedAt: at(11),
      type: "set_seat",
      tableId: visit.tableId,
      visitId: visit.id,
      seatingId: SeatingId.make(uuid()),
      seat: 1,
      occurredAt: at(11),
    }),
  );

  expect(visitSeatsNow(shrunkTo1.seatings.filter((s) => s.visitId === visit.id))).toEqual([1]);

  const alexTo3: RecordingLedger = applyRecordingCommand(
    shrunkTo1,
    RecordingCommand.make({
      ...common(),
      preparedAt: at(12),
      type: "set_seat",
      tableId: visit.tableId,
      visitId: visit.id,
      seatingId: SeatingId.make(uuid()),
      seat: 3,
      occurredAt: at(12),
    }),
  );

  const beaMovedTo2And6: RecordingLedger = applyRecordingCommand(
    alexTo3,
    RecordingCommand.make({
      ...common(),
      preparedAt: at(13),
      type: "set_seat",
      tableId: visit.tableId,
      visitId: beaVisitId,
      seatingId: SeatingId.make(uuid()),
      seat: null,
      seats: [2, 6],
      occurredAt: at(13),
    }),
  );

  const alexSecondLast = beaMovedTo2And6.seatings.findLast(
    (s) => s.visitId === visit.id && s.voidedAt === null,
  )!;

  expect(() =>
    applyRecordingCommand(
      beaMovedTo2And6,
      RecordingCommand.make({
        ...common(),
        preparedAt: at(14),
        type: "void_seating",
        tableId: visit.tableId,
        visitId: visit.id,
        seatingId: alexSecondLast.id,
        reason: "Wait no, reverted to [1]",
      }),
    ),
  ).not.toThrow();

  const movedTo6 = beaMovedTo2And6.seatings.findLast(
    (s) => s.visitId === beaVisitId && s.voidedAt === null,
  )!;

  const alexTo4: RecordingLedger = applyRecordingCommand(
    beaMovedTo2And6,
    RecordingCommand.make({
      ...common(),
      preparedAt: at(15),
      type: "set_seat",
      tableId: visit.tableId,
      visitId: visit.id,
      seatingId: SeatingId.make(uuid()),
      seat: 4,
      occurredAt: at(15),
    }),
  );

  expect(() =>
    applyRecordingCommand(
      alexTo4,
      RecordingCommand.make({
        ...common(),
        preparedAt: at(16),
        type: "void_seating",
        tableId: visit.tableId,
        visitId: beaVisitId,
        seatingId: movedTo6.id,
        reason: "Back to [4, 5]",
      }),
    ),
  ).toThrow("Seat 4 is already taken.");

  const beaDroppedTo2 = applyRecordingCommand(
    alexTo4,
    RecordingCommand.make({
      ...common(),
      preparedAt: at(17),
      type: "set_seat",
      tableId: visit.tableId,
      visitId: beaVisitId,
      seatingId: SeatingId.make(uuid()),
      seat: 2,
      occurredAt: at(17),
    }),
  );

  const beaDroppedId = beaDroppedTo2.seatings.findLast((s) => s.visitId === beaVisitId)!.id;

  const shrunkTo5: RecordingLedger = applyRecordingCommand(
    beaDroppedTo2,
    RecordingCommand.make({
      ...common(),
      preparedAt: at(18),
      type: "set_table_seats",
      tableId: visit.tableId,
      tableSeats: 5,
    }),
  );

  expect(() =>
    applyRecordingCommand(
      shrunkTo5,
      RecordingCommand.make({
        ...common(),
        preparedAt: at(19),
        type: "void_seating",
        tableId: visit.tableId,
        visitId: beaVisitId,
        seatingId: beaDroppedId,
        reason: "Back to [2, 6] past shrunk size",
      }),
    ),
  ).toThrow("Choose a seat from 1 to 5.");
});
