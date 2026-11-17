import { describe, expect, it } from "@effect/vitest";
import {
  CurrencyCode,
  GroupId,
  MinorUnits,
  PlayerId,
  TripId,
  UserId,
  VenueId,
  type GroupListItem,
} from "@stacks/contracts";
import * as DateTime from "effect/DateTime";

import { makeRecordingStore, type RecordingInput, type RecordingStore } from "./recording.ts";
import { makeRecordingSubmission, openDeviceRecordingStore } from "./recordingReact.tsx";
import {
  RecordingStorageError,
  type RecordingStorage,
  type RecordingStorageDocument,
} from "./recordingStorage.ts";
import {
  describeRecordingRejection,
  localTimeText,
  buyInTotalPreview,
  cashOutResultPreview,
  sessionReadout,
  sessionEditFields,
  parsePastSessionTimes,
  parseStartedAt,
  parseTimeNear,
  parseRecordingAmount,
  PRIVATE_RECORDING_NAMESPACE,
  recordingHome,
  recordingMonths,
  recordingVisit,
  venueChoices,
  venuePlace,
  tableTripOptions,
  UNDONE_REASON,
  historyLines,
  historyEntryName,
} from "./recordingView.ts";

const at = (hour: number) =>
  DateTime.makeUnsafe(`2026-11-06T${hour.toString().padStart(2, "0")}:00:00.000Z`);

const memory = () => {
  let document: RecordingStorageDocument = { revision: 0 };
  let failure: Error | null = null;
  const storage: RecordingStorage = {
    load: async () => document,
    commit: async (expected, payload) => {
      if (failure) throw failure;
      document = { revision: expected + 1, payload };
      return document.revision;
    },
    subscribe: () => () => undefined,
    close: async () => undefined,
  };
  return {
    storage,
    fail: (error: Error | null) => {
      failure = error;
    },
  };
};

const open = async () => {
  const db = memory();
  const store = makeRecordingStore(db.storage);
  await store.ready;
  return { db, store };
};
const save = (store: RecordingStore, input: RecordingInput) => store.execute(store.prepare(input));
const state = (store: RecordingStore) => store.getSnapshot().state!;

describe("recordingHome", () => {
  it("lists every live visit and counts only finished results", async () => {
    const { store } = await open();
    await save(store, { type: "start", buyIn: 20000, startedAt: at(9) });
    await save(store, { type: "start", buyIn: 5000, startedAt: at(10) });
    await save(store, {
      type: "record_completed",
      buyIn: 30000,
      cashOut: 0,
      startedAt: at(1),
      finishedAt: at(2),
    });
    await save(store, {
      type: "record_completed",
      buyIn: 10000,
      cashOut: 15000,
      startedAt: at(3),
      finishedAt: at(4),
    });
    const home = recordingHome(state(store));
    expect(home.active.map((item) => item.totals.buyIn)).toEqual([5000, 20000]);
    expect(home.active.every((item) => item.finalResult === null)).toBe(true);
    expect(home.finished.map((item) => item.finalResult)).toEqual([5000, -30000]);
    expect(home.finishedResult).toBe(-25000);
  });

  it("is even, not pending, when the finished results cancel out", async () => {
    const { store } = await open();
    expect(recordingHome(state(store))).toEqual({
      active: [],
      tables: [],
      finished: [],
      deleted: [],
      finishedResult: 0,
    });
    await save(store, {
      type: "record_completed",
      buyIn: 10000,
      cashOut: 10000,
      startedAt: at(1),
      finishedAt: at(2),
    });
    expect(recordingHome(state(store)).finished[0]!.finalResult).toBe(0);
  });
});

describe("recordingVisit", () => {
  it("voids the final cash-out and keeps the finish audit through an accidental-finish reopen", async () => {
    const { store } = await open();
    await save(store, { type: "start", buyIn: 20000, startedAt: at(9) });
    const visitId = state(store).visits[0]!.id;
    await save(store, { type: "finish", visitId, amount: 25000, finishedAt: at(11) });
    const finished = recordingVisit(state(store), visitId)!;
    expect(finished.finalResult).toBe(5000);
    const finalCashOutId = finished.finalCashOut!.id;

    await save(store, { type: "reopen", visitId, reason: "Still playing" });
    const reopened = recordingVisit(state(store), visitId)!;
    expect(reopened.finalResult).toBeNull();
    expect(reopened.totals.cashOut).toBe(0);
    expect(reopened.finalCashOut).toBeNull();
    expect(reopened.finishCashOuts.has(finalCashOutId)).toBe(true);
    expect(reopened.entries).toHaveLength(2);
    expect(reopened.events).toEqual([
      { type: "finished", at: at(11) },
      {
        type: "reopened",
        at: state(store).receipts.at(-1)!.command.preparedAt,
        reason: "Still playing",
        finishedAt: at(11),
      },
    ]);
  });

  it("links a corrected entry to its replacement and offers its amounts again", async () => {
    const { store } = await open();
    await save(store, { type: "start", buyIn: 20000, startedAt: at(9) });
    const visitId = state(store).visits[0]!.id;
    const original = state(store).entries[0]!;
    await save(store, {
      type: "correct",
      visitId,
      entryId: original.id,
      reason: "Typo",
      replacement: { amount: 10000 },
    });
    const view = recordingVisit(state(store), visitId)!;
    const replacement = view.entries.find((entry) => entry.replacesEntryId === original.id)!;
    expect(view.replacedBy.get(original.id)).toBe(replacement.id);
    expect(view.totals.buyIn).toBe(10000);
    expect(view.presets).toEqual([10000, 20000]);
    expect(recordingVisit(state(store), replacement.id as never)).toBeNull();
  });
});

describe("venueChoices", () => {
  const venue = (n: number, name: string, city: string | null) => ({
    id: VenueId.make(`0192e7a0-0000-7000-8000-00000000000${n}`),
    name,
    kind: "casino" as const,
    city,
    region: city ? "NV" : null,
    country: "US",
    lat: null,
    lng: null,
  });
  const bellagio = venue(1, "Bellagio", "Las Vegas");
  const aria = venue(2, "Aria", "Las Vegas");
  const borgata = venue(3, "Borgata", "Atlantic City");
  const cached = [bellagio, aria, borgata];

  it("lists the cached venues, newest first, before anything is searched", () => {
    expect(venueChoices(cached, "", false, undefined)).toEqual({
      status: "saved",
      venues: [borgata, aria, bellagio],
    });
  });

  it("offers cached venues matching the name or city while searching or offline", () => {
    expect(venueChoices(cached, "las veg", true, undefined)).toEqual({
      status: "searching",
      venues: [aria, bellagio],
    });
    expect(venueChoices(cached, "BORG", true, null)).toEqual({
      status: "offline",
      venues: [borgata],
    });
  });

  it("shows what the server found once it answers, even nothing", () => {
    expect(venueChoices(cached, "aria", true, [aria])).toEqual({ status: "found", venues: [aria] });
    expect(venueChoices(cached, "nowhere", true, [])).toEqual({ status: "found", venues: [] });
  });

  it("says where a venue is, or what kind it is without a city", () => {
    expect(venuePlace(bellagio)).toBe("Las Vegas, NV");
    expect(venuePlace({ ...bellagio, city: null, region: null, kind: "online" })).toBe("Online");
  });
});

describe("parseRecordingAmount", () => {
  it.each([
    ["", 1, "Enter an amount."],
    ["   ", 0, "Enter an amount."],
    ["-5", 0, "Enter an amount without a minus sign."],
    ["0", 1, "Enter an amount greater than zero."],
    ["12.345", 0, "Use whole cents, like 12.50."],
    ["99999999999999999999", 0, "That amount is too large."],
    ["abc", 0, "Enter an amount like $200."],
    ["1e3", 0, "Enter an amount like $200."],
    ["12abc", 0, "Enter an amount like $200."],
    ["1 2", 0, "Enter an amount like $200."],
    ["1.5k", 0, "Enter an amount like $200."],
  ] as const)("rejects %j", (text, minimum, error) => {
    expect(parseRecordingAmount(text, minimum)).toEqual({ error });
  });

  it.each([
    ["200", 1, 20000],
    ["$1,250.50", 1, 125050],
    ["0", 0, 0],
    ["0.5", 0, 50],
  ] as const)("reads %j as integer cents", (text, minimum, amount) => {
    expect(parseRecordingAmount(text, minimum)).toEqual({ amount, error: null });
  });
});

describe("parsePastSessionTimes", () => {
  const now = new Date(2026, 10, 8, 12, 0).getTime();

  it("reads local times and rolls a finish past midnight into the next day", () => {
    const result = parsePastSessionTimes(
      { date: "2026-11-06", start: "21:30", finish: "01:15" },
      now,
    );
    expect(result.error).toBeNull();
    if (result.error !== null) return;
    expect(DateTime.toEpochMillis(result.startedAt)).toBe(new Date(2026, 10, 6, 21, 30).getTime());
    expect(DateTime.toEpochMillis(result.finishedAt)).toBe(new Date(2026, 10, 7, 1, 15).getTime());
  });

  it.each([
    [{ date: "2026-02-30", start: "10:00", finish: "11:00" }, "date"],
    [{ date: "yesterday", start: "10:00", finish: "11:00" }, "date"],
    [{ date: "2026-11-06", start: "25:00", finish: "11:00" }, "start"],
    [{ date: "2026-11-06", start: "10:00", finish: "" }, "finish"],
    [{ date: "2026-11-08", start: "11:00", finish: "13:00" }, "finish"],
  ] as const)("rejects %j at %s", (input, field) => {
    expect(parsePastSessionTimes(input, now)).toMatchObject({ field });
  });
});

describe("parseTimeNear", () => {
  const local = (hours: number, minutes = 0, day = 7) =>
    DateTime.makeUnsafe(new Date(2026, 10, day, hours, minutes));

  it("reads a time as the moment nearest the reference, before or after it", () => {
    expect(parseTimeNear("20:15", local(21, 30))).toEqual(local(20, 15));
    expect(parseTimeNear("21:45", local(21, 30))).toEqual(local(21, 45));
  });

  it("crosses midnight to the nearer day", () => {
    expect(parseTimeNear("23:10", local(1, 5, 8))).toEqual(local(23, 10, 7));
    expect(parseTimeNear("00:20", local(23, 50, 7))).toEqual(local(0, 20, 8));
  });

  it("refuses what isn't a time", () => {
    for (const text of ["", "9pm", "24:00", "12:60"])
      expect(parseTimeNear(text, local(12))).toBeNull();
  });

  it("writes a moment back the way a time field holds it", () => {
    expect(localTimeText(local(9, 5))).toBe("09:05");
  });
});

describe("makeRecordingSubmission", () => {
  it("retries a failed save with the same prepared command, and prepares anew after", async () => {
    const { db, store } = await open();
    const submit = makeRecordingSubmission(store);
    const input = { type: "start", buyIn: 20000 } as const;
    db.fail(new RecordingStorageError("quota"));
    await expect(submit(input)).rejects.toThrow();
    const failed = store.getSnapshot().failedCommand!;
    await expect(submit(input)).rejects.toThrow();
    expect(store.getSnapshot().failedCommand).toEqual(failed);
    db.fail(null);
    const receipt = await submit(input);
    expect(receipt.command).toEqual(failed);

    const again = await submit(input);
    expect(again.command.operationId).not.toBe(failed.operationId);
    expect(state(store).visits).toHaveLength(2);
  });

  it("prepares a new command once the draft changes", async () => {
    const { db, store } = await open();
    const submit = makeRecordingSubmission(store);
    db.fail(new Error("disk"));
    await expect(submit({ type: "start", buyIn: 20000 })).rejects.toThrow();
    const failed = store.getSnapshot().failedCommand!;
    db.fail(null);
    const receipt = await submit({ type: "start", buyIn: 25000 });
    expect(receipt.command.operationId).not.toBe(failed.operationId);
    expect(state(store).entries.map((entry) => entry.amount)).toEqual([25000]);
  });
});

describe("openDeviceRecordingStore", () => {
  it("opens the device namespace lazily and shows a failed open until a retry succeeds", async () => {
    const db = memory();
    const opened: string[] = [];
    let attempts = 0;
    const store = openDeviceRecordingStore(async (namespace) => {
      opened.push(namespace);
      if (attempts++ === 0) throw new RecordingStorageError("unavailable");
      return db.storage;
    });
    await expect(store.ready).rejects.toThrow();
    expect(store.getSnapshot().status).toBe("load_failed");
    await store.refresh();
    expect(store.getSnapshot().status).toBe("saved");
    expect(opened).toEqual([PRIVATE_RECORDING_NAMESPACE, PRIVATE_RECORDING_NAMESPACE]);
    await store.close();
  });
});

it("keeps deleted visits at their month end, outside Play, table and history totals", async () => {
  const { store } = await open();
  await save(store, {
    type: "record_completed",
    buyIn: 20000,
    cashOut: 30000,
    startedAt: at(9),
    finishedAt: at(10),
  });
  const deleted = state(store).visits[0]!.id;
  await save(store, {
    type: "record_completed",
    buyIn: 5000,
    cashOut: 0,
    startedAt: at(1),
    finishedAt: at(2),
  });
  const visible = state(store).visits[1]!.id;
  await save(store, { type: "delete_visit", visitId: deleted });
  const home = recordingHome(state(store));
  expect(home.finishedResult).toBe(-5000);
  expect(home.finished.map((item) => item.visit.id)).toEqual([visible]);
  expect(home.deleted.map((item) => item.visit.id)).toEqual([deleted]);
  const [month] = recordingMonths(home);
  expect(month!.count).toBe(1);
  expect(month!.result).toBe(-5000);
  expect(month!.minutes).toBe(60);
  expect(month!.visits.map((item) => item.visit.id)).toEqual([visible, deleted]);
  await store.close();
});

it("counts a month's finished sessions apart from live play", async () => {
  const { store } = await open();
  await save(store, {
    type: "record_completed",
    buyIn: 20000,
    cashOut: 30000,
    startedAt: at(1),
    finishedAt: at(2),
  });
  await save(store, { type: "start", buyIn: 5000, startedAt: at(9) });
  const [month] = recordingMonths(recordingHome(state(store)));
  expect(month!.count).toBe(2);
  expect(month!.finished).toBe(1);
  await store.close();
});

it.each(["delete_visit", "restore_visit"] as const)("names a refused %s change", async (type) => {
  const { store } = await open();
  await save(store, { type: "start", buyIn: 20000 });
  const visitId = state(store).visits[0]!.id;
  if (type === "restore_visit") await save(store, { type: "delete_visit", visitId });
  const command = store.prepare({ type, visitId });
  expect(
    describeRecordingRejection({ command, reason: "forbidden", message: "Only your own sessions" }),
  ).toBe(
    `${type === "delete_visit" ? "Deleting" : "Restoring"} a session didn't sync. At this table you can record only your own play.`,
  );
  await store.close();
});

describe("editing when a session started", () => {
  const local = (day: number, hour: number, minute = 0, second = 0) =>
    DateTime.makeUnsafe(new Date(2026, 10, day, hour, minute, second));
  const initial = local(6, 21, 30, 12);
  const first = local(6, 22, 0);

  it("moves the date as well as the time", () => {
    expect(parseStartedAt({ date: "2026-11-05", time: "21:30" }, initial, first)).toEqual({
      startedAt: local(5, 21, 30),
      error: null,
    });
  });

  it("keeps the second when neither field was touched", () => {
    expect(parseStartedAt({ date: "2026-11-06", time: "21:30" }, initial, first)).toEqual({
      startedAt: initial,
      error: null,
    });
  });

  it("names the field that's wrong", () => {
    expect(parseStartedAt({ date: "11/06", time: "21:30" }, initial, first)).toMatchObject({
      field: "date",
    });
    expect(parseStartedAt({ date: "2026-11-06", time: "9pm" }, initial, first)).toMatchObject({
      field: "time",
    });
    expect(parseStartedAt({ date: "2026-11-07", time: "21:30" }, initial, first)).toMatchObject({
      field: "date",
      error: "The start can't be after your first buy-in.",
    });
  });
});

describe("live session readouts", () => {
  it("keeps the result pending while live and freezes duration and hourly result at finish", async () => {
    const { store } = await open();
    await save(store, { type: "start", buyIn: 25000, startedAt: at(9) });
    const id = state(store).visits[0]!.id;
    const live = recordingVisit(state(store), id)!;
    expect(sessionReadout(live, DateTime.add(at(10), { seconds: 22 }))).toEqual({
      clock: "1:00:22",
      buyIns: 1,
      corrected: false,
      hourly: null,
    });
    expect(cashOutResultPreview(live, "350")).toBe(10000);
    expect(cashOutResultPreview(live, "0")).toBe(-25000);
    expect(cashOutResultPreview(live, "")).toBeNull();
    await save(store, { type: "finish", visitId: id, amount: 35000, finishedAt: at(11) });
    expect(sessionReadout(recordingVisit(state(store), id)!, at(14))).toEqual({
      clock: "2:00:00",
      buyIns: 1,
      corrected: false,
      hourly: 5000,
    });
    expect(sessionEditFields(live, false).map((field) => field.field)).toEqual([
      "buy_in",
      "start_time",
    ]);
    expect(sessionEditFields(live, true).map((field) => field.field)).toEqual([
      "buy_in",
      "start_time",
      "game",
      "venue",
    ]);
    expect(
      sessionEditFields(recordingVisit(state(store), id)!, false).map((field) => field.field),
    ).toEqual(["start_time"]);
    await store.close();
  });

  it("has no hourly rate for an instantaneous finish and counts only standing buy-ins", async () => {
    const { store } = await open();
    await save(store, {
      type: "record_completed",
      buyIn: 20000,
      cashOut: 0,
      startedAt: at(9),
      finishedAt: at(9),
    });
    const id = state(store).visits[0]!.id;
    const original = recordingVisit(state(store), id)!.entries.find(
      (entry) => entry.kind === "buy_in",
    )!;
    await save(store, {
      type: "correct",
      visitId: id,
      entryId: original.id,
      reason: "Typo",
      replacement: { amount: 15000 },
    });
    expect(sessionReadout(recordingVisit(state(store), id)!, at(10))).toEqual({
      clock: "0:00:00",
      buyIns: 1,
      corrected: true,
      hourly: null,
    });
    await store.close();
  });

  it("doesn't call a buy-in corrected when a rebuy was only undone", async () => {
    const { store } = await open();
    await save(store, { type: "start", buyIn: 20000, startedAt: at(9) });
    const id = state(store).visits[0]!.id;
    await save(store, { type: "add", visitId: id, kind: "buy_in", amount: 10000 });
    const rebuy = recordingVisit(state(store), id)!.entries.find((e) => e.amount === 10000)!;
    await save(store, {
      type: "correct",
      visitId: id,
      entryId: rebuy.id,
      reason: UNDONE_REASON,
      replacement: null,
    });
    const undone = recordingVisit(state(store), id)!;
    expect(sessionReadout(undone, at(10))).toMatchObject({ buyIns: 1, corrected: false });

    await save(store, {
      type: "correct",
      visitId: id,
      entryId: undone.entries.find((e) => e.amount === 20000)!.id,
      reason: "Typo",
      replacement: { amount: 15000 },
    });
    expect(sessionReadout(recordingVisit(state(store), id)!, at(10))).toMatchObject({
      corrected: true,
    });
    await store.close();
  });

  describe("a visit's history", () => {
    it("labels rebuys and corrections, and lists standing entries above voided ones", async () => {
      const { store } = await open();
      await save(store, { type: "start", buyIn: 20000, startedAt: at(9) });
      const id = state(store).visits[0]!.id;
      await save(store, {
        type: "add",
        visitId: id,
        kind: "buy_in",
        amount: 10000,
        occurredAt: at(10),
      });
      await save(store, {
        type: "add",
        visitId: id,
        kind: "buy_in",
        amount: 30000,
        occurredAt: at(11),
      });
      const view = () => recordingVisit(state(store), id)!;
      const first = view().entries.find((e) => e.amount === 20000)!;
      const third = view().entries.find((e) => e.amount === 30000)!;
      await save(store, {
        type: "correct",
        visitId: id,
        entryId: first.id,
        reason: "Typo",
        replacement: { amount: 25000 },
      });
      await save(store, {
        type: "correct",
        visitId: id,
        entryId: third.id,
        reason: UNDONE_REASON,
        replacement: null,
      });
      await save(store, { type: "finish", visitId: id, amount: 35000, finishedAt: at(12) });

      const lines = historyLines(view());
      // Every row counts, the finish included, so a header can say how many there are.
      expect(lines.map((line) => (line.type === "event" ? "finished" : line.entry.amount))).toEqual(
        ["finished", 35000, 10000, 25000, 30000, 20000],
      );
      const names = lines.flatMap((line) =>
        line.type === "entry"
          ? [`${line.entry.amount}:${historyEntryName(view(), line.entry)}`]
          : [],
      );
      expect(names).toEqual([
        "35000:Final cash-out",
        "10000:Rebuy",
        "25000:Corrected buy-in",
        "30000:Rebuy",
        "20000:Buy-in",
      ]);
      await store.close();
    });
  });

  it("previews whole-cent add, subtract and set totals without displaying unsafe values", () => {
    expect(buyInTotalPreview(30000, "0.01", "add")).toBe(30001);
    expect(buyInTotalPreview(30000, "50", "subtract")).toBe(25000);
    expect(buyInTotalPreview(30000, "250", "set")).toBe(25000);
    expect(buyInTotalPreview(30000, "300", "subtract")).toBeNull();
    expect(buyInTotalPreview(30000, "301", "subtract")).toBeNull();
    expect(buyInTotalPreview(Number.MAX_SAFE_INTEGER, "0.01", "add")).toBeNull();
    expect(buyInTotalPreview(30000, "1.001", "set")).toBeNull();
  });
});

it("offers only live trips in the recording currency, including when a mismatched trip was selected", () => {
  const groupId = GroupId.make(crypto.randomUUID());
  const trip = (name: string, endedAt: DateTime.Utc | null = null) => ({
    id: TripId.make(crypto.randomUUID()),
    groupId,
    name,
    startedAt: at(9),
    endedAt,
    createdBy: UserId.make("owner"),
    createdAt: at(9),
  });
  const live = trip("Vegas");
  const ended = trip("Reno", at(10));
  const euro = trip("Paris");
  const yen = trip("Tokyo");
  const group = (currency: string, trips: GroupListItem["trips"]): GroupListItem => ({
    group: { id: groupId, name: "Crew", currency: CurrencyCode.make(currency), createdAt: at(9) },
    role: "owner",
    myPlayerId: PlayerId.make(crypto.randomUUID()),
    myBalance: MinorUnits.make(0),
    liveSessionCount: 0,
    liveTripIds: [],
    currentTripId: null,
    mySession: null,
    trips,
  });
  const groups = [group("USD", [live, ended]), group("EUR", [euro]), group("JPY", [yen])];
  const expected = [
    { key: "", label: "Personal · no trip" },
    { key: live.id, label: "Crew · Vegas" },
  ];
  expect(tableTripOptions(groups, null)).toEqual(expected);
  expect(tableTripOptions(groups, euro.id)).toEqual(expected);
  expect(tableTripOptions(groups, yen.id)).toEqual(expected);
  expect(tableTripOptions(groups, ended.id)).toEqual([
    expected[0],
    { key: ended.id, label: "Current trip" },
    expected[1],
  ]);
});
