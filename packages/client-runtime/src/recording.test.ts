import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import { RecordingCommand } from "@stacks/contracts/recordingCommands";

import { makeRecordingStore, type RecordingStore } from "./recording.ts";
import {
  RecordingStorageConflict,
  RecordingStorageError,
  type RecordingStorage,
  type RecordingStorageChange,
  type RecordingStorageDocument,
} from "./recordingStorage.ts";

const at = (hour: number) =>
  DateTime.makeUnsafe(`2026-11-06T${hour.toString().padStart(2, "0")}:00:00.000Z`);
const memory = () => {
  let document: RecordingStorageDocument = { revision: 0 };
  let failure = false;
  let notificationFailure = false;
  let gate: Promise<void> | undefined;
  const listeners = new Set<(change: RecordingStorageChange) => void>();
  const adapter = (): RecordingStorage => ({
    load: async () => document,
    commit: async (expected, payload) => {
      if (gate) await gate;
      if (failure) throw new Error("disk full");
      if (document.revision !== expected)
        throw new RecordingStorageConflict(expected, document.revision);
      document = { revision: expected + 1, payload };
      if (notificationFailure)
        for (const listener of listeners)
          listener({ type: "error", error: new RecordingStorageError("unavailable") });
      return document.revision;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    close: async () => undefined,
  });
  return {
    adapter,
    breakNotifications: () => {
      notificationFailure = true;
    },
    get document() {
      return document;
    },
    set document(next) {
      document = next;
    },
    fail: (value = true) => {
      failure = value;
    },
    gate: (value: Promise<void> | undefined) => {
      gate = value;
    },
    notify: () => {
      for (const listener of listeners) listener({ type: "commit", revision: document.revision });
    },
  };
};
const open = async (db: ReturnType<typeof memory>) => {
  const store = makeRecordingStore(db.adapter());
  await store.ready;
  return store;
};
const start = (store: RecordingStore) =>
  store.prepare({ type: "start", buyIn: 20000, startedAt: at(10) });
const visitId = (store: RecordingStore) => store.getSnapshot().state!.visits[0]!.id;
const save = (store: RecordingStore, input: Parameters<RecordingStore["prepare"]>[0]) =>
  store.execute(store.prepare(input));
const reload = async (store: RecordingStore, db: ReturnType<typeof memory>) => {
  await store.close();
  return open(db);
};

it("records the complete money flow across a reopen after every save without auth", async () => {
  const db = memory();
  let store = await open(db);
  const identity = store.getSnapshot().state!.self;
  const actor = store.getSnapshot().state!.actor;
  const first = start(store);
  await store.execute(first);
  store = await reload(store, db);
  const id = visitId(store);
  expect(store.review(id).summary.finalResult).toBeNull();
  await save(store, {
    type: "add",
    visitId: id,
    kind: "buy_in",
    amount: 10000,
    occurredAt: at(11),
  });
  store = await reload(store, db);
  await save(store, {
    type: "add",
    visitId: id,
    kind: "cash_out",
    amount: 10000,
    occurredAt: at(12),
  });
  store = await reload(store, db);
  expect(store.review(id).summary).toMatchObject({
    totals: { buyIn: 30000, cashOut: 10000 },
    finalResult: null,
  });
  await save(store, { type: "finish", visitId: id, amount: 25000, finishedAt: at(13) });
  store = await reload(store, db);
  expect(store.review(id).summary).toMatchObject({
    totals: { buyIn: 30000, cashOut: 35000 },
    finalResult: 5000,
  });
  expect(store.getSnapshot()).toMatchObject({
    status: "saved",
    publication: "private",
    failedCommand: null,
  });
  expect(store.getSnapshot().state).toMatchObject({
    self: identity,
    actor,
    tables: [expect.objectContaining({ tripId: null })],
  });
  expect(store.getSnapshot().state!.receipts.map((receipt) => receipt.revision)).toEqual([
    2, 3, 4, 5,
  ]);
  const before = db.document;
  expect(await store.execute(first)).toEqual(store.getSnapshot().state!.receipts[0]);
  expect(db.document).toEqual(before);
  await store.close();
});

it("fails initialization without presenting a saved identity and can explicitly reload", async () => {
  const db = memory();
  db.fail();
  const store = makeRecordingStore(db.adapter());
  await expect(store.ready).rejects.toThrow("disk full");
  expect(store.getSnapshot()).toMatchObject({ state: null, status: "load_failed", revision: 0 });
  expect(() => start(store)).toThrow();
  db.fail(false);
  await store.refresh();
  expect(store.getSnapshot().state!.actor.userId).toBeNull();
  await store.close();
});

it.each(["start", "finish", "correct"] as const)(
  "rolls back a failed %s with the original prepared IDs available for explicit retry",
  async (type) => {
    const db = memory();
    let store = await open(db);
    if (type !== "start") await store.execute(start(store));
    const id = store.getSnapshot().state!.visits[0]?.id;
    const command =
      type === "start"
        ? start(store)
        : type === "finish"
          ? store.prepare({ type, visitId: id!, amount: 25000, finishedAt: at(13) })
          : store.prepare({
              type,
              visitId: id!,
              entryId: store.getSnapshot().state!.entries[0]!.id,
              reason: "wrong buy-in",
              replacement: { amount: 18000 },
            });
    const before = db.document;
    const state = store.getSnapshot().state;
    db.fail();
    await expect(store.execute(command)).rejects.toThrow("disk full");
    expect(db.document).toEqual(before);
    expect(store.getSnapshot()).toMatchObject({
      state,
      status: "save_failed",
      failedCommand: command,
    });
    db.fail(false);
    const receipt = await store.retry();
    expect(receipt.command).toEqual(command);
    store = await reload(store, db);
    expect(store.getSnapshot().state!.receipts.at(-1)).toEqual(receipt);
    await store.close();
  },
);

it("preserves original facts, replacement chains, void reasons and finish/reopen audit after restart", async () => {
  const db = memory();
  let store = await open(db);
  await store.execute(start(store));
  const id = visitId(store);
  await save(store, { type: "finish", visitId: id, amount: 25000, finishedAt: at(13) });
  const original = store.getSnapshot().state!.entries.at(-1)!;
  await save(store, {
    type: "correct",
    visitId: id,
    entryId: original.id,
    reason: "counted again",
    replacement: { amount: 24000 },
  });
  store = await reload(store, db);
  expect(store.review(id).summary.finalResult).toBe(4000);
  expect(store.review(id).entries.find((entry) => entry.id === original.id)).toMatchObject({
    amount: 25000,
    voidReason: "counted again",
    voidedBy: store.getSnapshot().state!.actor.id,
  });
  const replacement = store.getSnapshot().state!.entries.at(-1)!;
  expect(replacement.replacesEntryId).toBe(original.id);
  await save(store, {
    type: "correct",
    visitId: id,
    entryId: replacement.id,
    reason: "duplicate cash-out",
    replacement: null,
  });
  store = await reload(store, db);
  expect(store.review(id).summary.finalResult).toBe(-20000);
  await save(store, { type: "reopen", visitId: id, reason: "finished accidentally" });
  store = await reload(store, db);
  expect(store.review(id).summary.finalResult).toBeNull();
  expect(store.getSnapshot().state!.receipts.at(-1)!.command).toMatchObject({
    type: "reopen",
    reason: "finished accidentally",
  });
  expect(
    store.getSnapshot().state!.receipts.some((receipt) => receipt.command.type === "finish"),
  ).toBe(true);
  await store.close();
});

it("supports zero final cash-out and requires a new visit for a genuine return", async () => {
  const db = memory();
  const store = await open(db);
  await store.execute(start(store));
  const id = visitId(store);
  await save(store, { type: "finish", visitId: id, amount: 0, finishedAt: at(12) });
  expect(store.review(id).summary.finalResult).toBe(-20000);
  await expect(
    save(store, { type: "add", visitId: id, kind: "buy_in", amount: 1000 }),
  ).rejects.toThrow("finished");
  await store.execute(start(store));
  expect(store.getSnapshot().state!.visits).toHaveLength(2);
  expect(store.getSnapshot().state!.visits[1]!.id).not.toBe(id);
  await store.close();
});

it("records completed past totals atomically and rejects reversed times", async () => {
  const db = memory();
  let store = await open(db);
  await save(store, {
    type: "record_completed",
    buyIn: 30000,
    cashOut: 35000,
    startedAt: at(10),
    finishedAt: at(13),
  });
  store = await reload(store, db);
  expect(store.review(visitId(store)).summary.finalResult).toBe(5000);
  expect(store.getSnapshot().state!.entries).toHaveLength(2);
  const before = db.document;
  await expect(
    save(store, {
      type: "record_completed",
      buyIn: 20000,
      cashOut: 0,
      startedAt: at(13),
      finishedAt: at(10),
    }),
  ).rejects.toThrow();
  expect(db.document).toEqual(before);
  await store.close();
});

it("rejects operation ID reuse with different content even after reload", async () => {
  const db = memory();
  let store = await open(db);
  const command = start(store);
  if (command.type !== "start") throw new Error("expected start");
  await store.execute(command);
  store = await reload(store, db);
  const changed = RecordingCommand.make({ ...command, highLimit: true });
  await expect(store.execute(changed)).rejects.toMatchObject({ reason: "operation_reused" });
  expect(store.getSnapshot().state!.entries).toHaveLength(1);
  await store.close();
});

it("serializes saves and never shows financial success before the adapter commits", async () => {
  const db = memory();
  const store = await open(db);
  let release!: () => void;
  db.gate(
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  const saving = new Promise<void>((resolve) => {
    const unsubscribe = store.subscribe(() => {
      if (store.getSnapshot().status === "saving") {
        unsubscribe();
        resolve();
      }
    });
  });
  const command = start(store);
  const first = store.execute(command);
  const duplicate = store.execute(command);
  await saving;
  expect(store.getSnapshot()).toMatchObject({
    status: "saving",
    revision: 1,
    state: { entries: [], receipts: [] },
  });
  release();
  db.gate(undefined);
  expect(await first).toEqual(await duplicate);
  expect(store.getSnapshot().state!.entries).toHaveLength(1);
  await store.close();
});

it("exposes CAS and stale financial conflicts without rebasing; refresh can recover an identical receipt", async () => {
  const db = memory();
  const a = await open(db);
  await a.execute(start(a));
  const b = await open(db);
  const id = visitId(a);
  const finish = b.prepare({ type: "finish", visitId: id, amount: 25000, finishedAt: at(13) });
  const rebuy = a.prepare({
    type: "add",
    visitId: id,
    kind: "buy_in",
    amount: 10000,
    occurredAt: at(11),
  });
  await a.execute(rebuy);
  await expect(b.execute(finish)).rejects.toBeInstanceOf(RecordingStorageConflict);
  await b.refresh();
  expect(b.getSnapshot().failedCommand).toEqual(finish);
  await expect(b.retry()).rejects.toMatchObject({ reason: "conflict" });
  expect(b.review(id).summary.finalResult).toBeNull();
  expect(await b.execute(rebuy)).toEqual(a.getSnapshot().state!.receipts.at(-1));
  await a.close();
  await b.close();
});

it("observes another store's durable change through subscriptions", async () => {
  const db = memory();
  const a = await open(db);
  const b = await open(db);
  const changed = new Promise<void>((resolve) => {
    const unsubscribe = b.subscribe(() => {
      if (b.getSnapshot().revision === 2) {
        unsubscribe();
        resolve();
      }
    });
  });
  await a.execute(start(a));
  db.notify();
  await changed;
  expect(b.getSnapshot().state).toEqual(a.getSnapshot().state);
  await a.close();
  await b.close();
});

it("bounds monetary totals and rejects invalid new facts before saving", async () => {
  const db = memory();
  const store = await open(db);
  await save(store, { type: "start", buyIn: Number.MAX_SAFE_INTEGER, startedAt: at(10) });
  const before = db.document;
  await expect(
    save(store, {
      type: "add",
      visitId: visitId(store),
      kind: "buy_in",
      amount: 1,
      occurredAt: at(11),
    }),
  ).rejects.toThrow();
  await expect(
    save(store, {
      type: "add",
      visitId: visitId(store),
      kind: "cash_out",
      amount: -1,
      occurredAt: at(11),
    }),
  ).rejects.toThrow();
  expect(() => store.prepare({ type: "start", buyIn: 0.1 })).toThrow();
  expect(db.document).toEqual(before);
  await store.close();
});

describe("persisted document validation", () => {
  it.each([
    "json",
    "version",
    "ownership",
    "replacement",
    "timestamp",
    "overflow",
    "duplicate",
    "credentials",
    "receipt_amount",
    "receipt_revision",
    "missing_receipt",
  ])("surfaces %s damage without empty-history fallback", async (damage) => {
    const db = memory();
    const store = await open(db);
    await store.execute(start(store));
    await store.close();
    const document = db.document;
    if (document.payload === undefined) throw new Error("missing test history");
    const value = JSON.parse(document.payload);
    if (damage === "version") value.version = 2;
    if (damage === "ownership") value.visits[0].playerId = value.actor.id;
    if (damage === "replacement") value.entries[0].replacesEntryId = value.actor.id;
    if (damage === "timestamp") value.entries[0].occurredAt = "2026-11-05T00:00:00.000Z";
    if (damage === "overflow") value.entries[0].amount = Number.MAX_SAFE_INTEGER + 1;
    if (damage === "duplicate") value.entries.push(value.entries[0]);
    if (damage === "receipt_amount") value.receipts[0].command.buyIn = 12345;
    if (damage === "receipt_revision") value.visits[0].revision = 8;
    if (damage === "missing_receipt") value.receipts = [];
    if (damage === "credentials") value.secret = "should not live in the financial document";
    db.document = {
      revision: document.revision,
      payload: damage === "json" ? "{" : JSON.stringify(value),
    };
    const broken = makeRecordingStore(db.adapter());
    await expect(broken.ready).rejects.toMatchObject({ reason: "load" });
    expect(broken.getSnapshot()).toMatchObject({ state: null, status: "load_failed" });
    await broken.close();
  });
});

it("keeps a failed reload blocking writes and drains accepted operations on close", async () => {
  const db = memory();
  const store = await open(db);
  const command = start(store);
  const original = db.document;
  db.document = { revision: 1, payload: "broken" };
  await expect(store.refresh()).rejects.toThrow();
  await expect(store.execute(command)).rejects.toThrow("Load recording history");
  await expect(store.execute(command)).rejects.toThrow("Load recording history");
  db.document = original;
  await store.refresh();
  const writing = store.execute(command);
  const closing = store.close();
  await writing;
  await closing;
  expect(store.getSnapshot().status).toBe("closed");
  await expect(store.execute(command)).rejects.toMatchObject({ reason: "closed" });
  const reopened = await open(db);
  expect(reopened.getSnapshot().state!.entries).toHaveLength(1);
  await reopened.close();
});

it("retains post-commit storage errors while acknowledging saved facts", async () => {
  const db = memory();
  const store = await open(db);
  db.breakNotifications();
  const receipt = await store.execute(start(store));
  expect(store.getSnapshot()).toMatchObject({
    status: "load_failed",
    revision: 2,
    error: { reason: "unavailable" },
  });
  expect(store.getSnapshot().state!.receipts[0]).toEqual(receipt);
  expect(() => start(store)).toThrow("Load recording history");
  await store.close();
  const reopened = await open(db);
  expect(reopened.getSnapshot().state!.receipts[0]).toEqual(receipt);
  await reopened.close();
});

it("retains a voided mistaken timestamp when finishing at the corrected time", async () => {
  const db = memory();
  const store = await open(db);
  await store.execute(start(store));
  const id = visitId(store);
  const late = await save(store, {
    type: "add",
    visitId: id,
    kind: "cash_out",
    amount: 1000,
    occurredAt: at(13),
  });
  await expect(
    save(store, { type: "finish", visitId: id, amount: 25000, finishedAt: at(12) }),
  ).rejects.toThrow("Fact outside visit times");
  if (late.command.type !== "add") throw new Error("expected add");
  await save(store, {
    type: "correct",
    visitId: id,
    entryId: late.command.entryId,
    reason: "wrong time",
    replacement: { amount: 1000, occurredAt: at(11) },
  });
  await save(store, { type: "finish", visitId: id, amount: 24000, finishedAt: at(12) });
  await store.close();
  const reopened = await open(db);
  expect(reopened.review(id).summary.finalResult).toBe(5000);
  expect(reopened.review(id).entries).toHaveLength(4);
  await reopened.close();
});

it("concurrent initialization converges on one saved player and actor", async () => {
  const db = memory();
  const a = makeRecordingStore(db.adapter());
  const b = makeRecordingStore(db.adapter());
  await Promise.all([a.ready, b.ready]);
  expect(a.getSnapshot().state).toEqual(b.getSnapshot().state);
  expect(db.document.revision).toBe(1);
  await a.close();
  await b.close();
});

it("competing corrections leave exactly one replacement and a reviewable conflict", async () => {
  const db = memory();
  const a = await open(db);
  await a.execute(start(a));
  const b = await open(db);
  const id = visitId(a);
  const entryId = a.getSnapshot().state!.entries[0]!.id;
  const second = b.prepare({
    type: "correct",
    visitId: id,
    entryId,
    reason: "second count",
    replacement: { amount: 17000 },
  });
  await save(a, {
    type: "correct",
    visitId: id,
    entryId,
    reason: "first count",
    replacement: { amount: 18000 },
  });
  await expect(b.execute(second)).rejects.toBeInstanceOf(RecordingStorageConflict);
  await b.refresh();
  await expect(b.retry()).rejects.toMatchObject({ reason: "conflict" });
  expect(b.review(id).summary.totals.buyIn).toBe(18000);
  expect(b.review(id).entries).toHaveLength(2);
  await a.close();
  await b.close();
});
