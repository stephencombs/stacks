import { describe, expect, it } from "@effect/vitest";
import {
  MinorUnits,
  PlayerIdentity,
  type PlayerId,
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

    // Cashing out another player leaves the table open until the last player.
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
    // The same device seen as a joiner: its own visit is local, the starter's comes from the server.
    const bea = PlayerIdentity.make({
      id: "0192e7a0-0000-7000-8000-00000000be00" as PlayerId,
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
    const seat = (name: string, playing = true, isSelf = false) => ({
      visitId: name as VisitId,
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
    expect(cashOutNote(seats, "Priya" as VisitId)).toBe(
      "Priya's visit ends. You, Dev and Jonah keep playing.",
    );
    expect(cashOutNote([seat("Priya"), seat("Dev")], "Priya" as VisitId)).toBe(
      "Priya's visit ends. Dev keeps playing.",
    );
    expect(cashOutNote([seat("Priya"), seat("Sam", false)], "Priya" as VisitId)).toBe(
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
