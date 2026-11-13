import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";

import { makeRecordingStore, type RecordingInput, type RecordingStore } from "./recording.ts";
import { makeRecordingSubmission, openDeviceRecordingStore } from "./recordingReact.tsx";
import {
  RecordingStorageError,
  type RecordingStorage,
  type RecordingStorageDocument,
} from "./recordingStorage.ts";
import {
  localTimeText,
  parsePastSessionTimes,
  parseTimeNear,
  parseRecordingAmount,
  PRIVATE_RECORDING_NAMESPACE,
  recordingHome,
  recordingVisit,
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
    expect(recordingHome(state(store))).toEqual({ active: [], finished: [], finishedResult: 0 });
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
