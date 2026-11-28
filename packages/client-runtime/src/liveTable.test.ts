import { describe, expect, it } from "@effect/vitest";
import {
  ActorId,
  MinorUnits,
  PlayerId,
  PlayerIdentity,
  SeatingId,
  VisitSeating,
  type TableView,
  type VisitId,
} from "@stacks/contracts";
import { formatMoney } from "@stacks/shared/money";
import { visitSummary } from "@stacks/shared/visits";
import * as DateTime from "effect/DateTime";

import type { RecordingCommand } from "@stacks/contracts/recordingCommands";

import { formatTime } from "./format.ts";
import { cashOutNote, liveTable, tableActions } from "./liveTable.ts";
import { makeRecordingStore, type RecordingInput, type RecordingStore } from "./recording.ts";
import type { RecordingStorageDocument } from "./recordingStorage.ts";
import { RECORDING_CURRENCY, recordingTable } from "./recordingView.ts";

const at = (hour: number, minute = 0) => DateTime.makeUnsafe(Date.UTC(2026, 10, 6, hour, minute));

const open = async () => {
  let document: RecordingStorageDocument = { revision: 0 };

  const store = makeRecordingStore({
    load: async () => document,
    commit: async (expected, payload) => {
      document = { revision: expected + 1, payload };

      return document.revision;
    },
    subscribe: () => () => undefined,
    close: async () => undefined,
  });

  await store.ready;

  return store;
};

const save = async (store: RecordingStore, input: RecordingInput) => {
  const command = store.prepare(input);
  await store.execute(command);

  return command;
};

const state = (store: RecordingStore) => store.getSnapshot().state!;
const visitOf = (command: RecordingCommand) => ("visitId" in command ? command.visitId : null)!;

describe("liveTable", () => {
  it("leads with who's playing, says who sat down later, and fades who cashed out", async () => {
    const store = await open();
    const mine = await save(store, { type: "start", buyIn: 20000, startedAt: at(21) });
    const tableId = state(store).tables[0]!.id;

    const priya = await save(store, {
      type: "join_table",
      tableId,
      displayName: "Priya",
      buyIn: 30000,
      startedAt: at(21),
    });

    const jonah = await save(store, {
      type: "join_table",
      tableId,
      displayName: "Jonah",
      buyIn: 20000,
      startedAt: at(21, 3),
    });

    const dev = await save(store, {
      type: "join_table",
      tableId,
      displayName: "Dev",
      buyIn: 10000,
      startedAt: at(22, 5),
    });

    await save(store, {
      type: "finish",
      visitId: visitOf(priya),
      amount: 50000,
      finishedAt: at(22, 52),
    });
    const table = liveTable(recordingTable(state(store), tableId)!, undefined);
    expect(table.seats.map((seat) => [seat.name, seat.status, seat.playing])).toEqual([
      ["You", "Playing", true],
      ["Jonah", "Playing", true],
      ["Dev", `Playing · sat down ${formatTime(at(22, 5))}`, true],
      [
        "Priya",
        `Cashed out ${formatTime(at(22, 52))} · ${formatMoney(MinorUnits.make(30000), RECORDING_CURRENCY)} in`,
        false,
      ],
    ]);
    expect(table.seats.map((seat) => seat.amount)).toEqual([20000, 20000, 10000, 20000]);
    expect(table.seats.map((seat) => seat.recordable)).toEqual([false, true, true, true]);
    expect(table).toMatchObject({ startedAt: at(21), inPlay: 50000, playing: 3, closed: false });
    expect(table.seats[0]!.visitId).toBe(visitOf(mine));

    expect(cashOutNote(table.seats, visitOf(dev))).toBe(
      "Dev's visit ends. You and Jonah keep playing.",
    );
    await save(store, { type: "finish", visitId: visitOf(dev), amount: 0, finishedAt: at(23) });
    expect(liveTable(recordingTable(state(store), tableId)!, undefined).closed).toBe(false);
    await save(store, { type: "finish", visitId: visitOf(mine), amount: 0, finishedAt: at(23) });
    expect(liveTable(recordingTable(state(store), tableId)!, undefined).playing).toBe(1);
    await save(store, { type: "finish", visitId: visitOf(jonah), amount: 0, finishedAt: at(23) });
    expect(liveTable(recordingTable(state(store), tableId)!, undefined)).toMatchObject({
      closed: true,
      playing: 0,
      inPlay: 0,
    });
  });

  it("shows a joiner everyone the server knows, and lets them record only their own play", async () => {
    const store = await open();
    const starter = await save(store, { type: "start", buyIn: 20000, startedAt: at(21) });
    const tableId = state(store).tables[0]!.id;
    const local = recordingTable(state(store), tableId)!;

    const bea = PlayerIdentity.make({
      id: PlayerId.make("0192e7a0-0000-7000-8000-00000000be00"),
      displayName: "Bea",
    });

    const joined = {
      ...local,
      role: "participant" as const,
      you: { player: bea, playing: null },
      visits: [],
    };

    const server: TableView = {
      table: local.table,
      players: [state(store).self, bea],
      visits: [visitSummary(state(store).visits[0]!, state(store).entries)],
      viewerRole: "participant",
      viewerPlayerId: bea.id,
      recorders: [],
      appointable: [],
      shared: false,
    };

    const table = liveTable(joined, server);
    expect(table.seats.map((seat) => [seat.name, seat.recordable])).toEqual([
      [state(store).self.displayName, false],
    ]);
    expect(table.seats[0]!.visitId).toBe(visitOf(starter));
    expect(liveTable(joined, null).seats).toEqual([]);
  });

  it("words a cash-out for the last player and for a crowd", () => {
    // SAFETY: cashOutNote only compares visit ids, so these fixture labels never need to be UUIDs.
    const visit = (name: string) => name as VisitId;

    const seat = (name: string, playing = true, isSelf = false) => ({
      visitId: visit(name),
      name: isSelf ? "You" : name,
      isSelf,
      playing,
    });

    const seats = [
      seat("You", true, true),
      seat("Priya"),
      seat("Dev"),
      seat("Jonah"),
      seat("Sam", false),
    ];

    expect(cashOutNote(seats, visit("Priya"))).toBe(
      "Priya's visit ends. You, Dev and Jonah keep playing.",
    );
    expect(cashOutNote([seat("Priya"), seat("Dev")], visit("Priya"))).toBe(
      "Priya's visit ends. Dev keeps playing.",
    );
    expect(cashOutNote([seat("Priya"), seat("Sam", false)], visit("Priya"))).toBe(
      "Priya's visit ends, and with it the table.",
    );
  });
});

it("tells two players with the same name apart", async () => {
  const store = await open();
  await save(store, { type: "open_table" });
  const tableId = state(store).tables[0]!.id;

  for (const buyIn of [20000, 10000])
    await save(store, {
      type: "join_table",
      tableId,
      displayName: "Priya",
      buyIn,
      startedAt: at(21),
    });
  const table = liveTable(recordingTable(state(store), tableId)!, undefined);
  expect(table.seats.map((seat) => seat.name)).toEqual(["Priya", "Priya 2"]);
});

it("keeps the same label when a player returns to the table", async () => {
  const store = await open();
  const first = await save(store, { type: "start", buyIn: 20000, startedAt: at(21) });
  const tableId = state(store).tables[0]!.id;
  await save(store, { type: "finish", visitId: visitOf(first), amount: 20000, finishedAt: at(22) });
  await save(store, {
    type: "join_table",
    tableId,
    playerId: state(store).self.id,
    buyIn: 10000,
    startedAt: at(23),
  });
  const table = liveTable(recordingTable(state(store), tableId)!, undefined);
  expect(table.seats.map((seat) => seat.name)).toEqual(["You", "You"]);
});

describe("tableActions", () => {
  it("gives each role only what its permissions allow, and never names the role", () => {
    const live = { playing: true, closed: false, empty: false };
    expect(tableActions("starter", live)).toEqual(["edit", "add_player", "share", "settings"]);
    expect(tableActions("participant", live)).toEqual(["edit"]);
    expect(tableActions("recorder", live)).toEqual(["edit", "add_player"]);
    expect(tableActions("recorder", { ...live, playing: false })).toEqual(["add_player"]);
    expect(tableActions("starter", { ...live, playing: false })).toEqual([
      "add_player",
      "share",
      "settings",
    ]);
    expect(tableActions("starter", { playing: false, closed: false, empty: true })).toEqual([
      "add_player",
      "share",
      "settings",
      "delete_table",
    ]);
    expect(tableActions("starter", { playing: false, closed: true, empty: false })).toEqual([]);
    expect(tableActions("participant", { playing: false, closed: false, empty: false })).toEqual(
      [],
    );
  });
});

describe("liveTable seats", () => {
  it("combines local and server seatings, uses server tableSeats for participants, and breaks reopen overlaps", async () => {
    const store = await open();

    const starter = await save(store, {
      type: "start",
      buyIn: 20000,
      startedAt: at(20),
      game: "blackjack",
      tableSeats: 7,
    });

    const starterVisit = visitOf(starter);
    const tableId = state(store).tables[0]!.id;

    const bea = await save(store, {
      type: "join_table",
      tableId,
      displayName: "Bea",
      buyIn: 10000,
      startedAt: at(20),
    });

    const beaVisit = visitOf(bea);

    await save(store, { type: "set_seat", visitId: starterVisit, seat: 7, occurredAt: at(20, 5) });
    await save(store, {
      type: "finish",
      visitId: starterVisit,
      amount: 25000,
      finishedAt: at(20, 10),
    });
    await save(store, { type: "set_seat", visitId: beaVisit, seat: 7, occurredAt: at(20, 15) });
    await save(store, { type: "reopen", visitId: starterVisit, reason: "Back in" });

    const table = liveTable(recordingTable(state(store), tableId)!, undefined);
    expect(table.tableSeats).toBe(7);
    expect([...table.occupiedSeats]).toEqual([[7, beaVisit]]);
    expect(table.seats.find((s) => s.visitId === starterVisit)).toMatchObject({
      seatNumbers: [],
      seatOutcome: { kind: "seat", seat: 7 },
    });
    expect(table.seats.find((s) => s.visitId === beaVisit)).toMatchObject({
      seatNumbers: [7],
      seatOutcome: { kind: "seat", seat: 7 },
    });

    const carol = PlayerIdentity.make({
      id: PlayerId.make("0192e7a0-0000-7000-8000-00000000ca01"),
      displayName: "Carol",
    });

    const participantStore = await open();

    const pStart = await save(participantStore, {
      type: "start",
      buyIn: 15000,
      startedAt: at(20),
      game: "blackjack",
      tableSeats: 5,
    });

    const carolVisit = visitOf(pStart);
    await save(participantStore, {
      type: "set_seat",
      visitId: carolVisit,
      seat: 2,
      occurredAt: at(20, 2),
    });

    const localTable = recordingTable(
      state(participantStore),
      state(participantStore).tables[0]!.id,
    )!;

    const joined = {
      ...localTable,
      role: "participant" as const,
      table: { ...localTable.table, starterPlayerId: carol.id },
    };

    const remoteSeating = VisitSeating.make({
      id: SeatingId.make(crypto.randomUUID()),
      visitId: beaVisit,
      seat: 6,
      occurredAt: at(20, 5),
      createdBy: ActorId.make(crypto.randomUUID()),
      createdAt: at(20, 5),
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
    });

    const server: TableView = {
      table: { ...localTable.table, tableSeats: 6 },
      players: [carol],
      visits: [
        visitSummary(
          state(store).visits.find((v) => v.id === beaVisit)!,
          state(store).entries,
        ),
      ],
      seatings: [remoteSeating],
      viewerRole: "participant",
      viewerPlayerId: localTable.you.player.id,
      recorders: [],
      appointable: [],
      shared: false,
    };

    const combined = liveTable(joined, server);
    expect(combined.tableSeats).toBe(6);
    expect([...combined.occupiedSeats]).toEqual([
      [2, carolVisit],
      [6, beaVisit],
    ]);

    await save(participantStore, {
      type: "set_seat",
      visitId: carolVisit,
      seats: [1, 2],
      occurredAt: at(20, 4),
    });

    const multiCombined = liveTable(
      {
        ...recordingTable(state(participantStore), state(participantStore).tables[0]!.id)!,
        role: "participant",
        table: { ...localTable.table, starterPlayerId: carol.id },
      },
      server,
    );

    expect([...multiCombined.occupiedSeats]).toEqual([
      [1, carolVisit],
      [2, carolVisit],
      [6, beaVisit],
    ]);
    expect(multiCombined.seats.find((s) => s.visitId === carolVisit)?.seatNumbers).toEqual([1, 2]);
    await participantStore.close();
    await store.close();
  });
});
