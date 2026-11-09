import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const driver = vi.hoisted(() => ({
  directory: "",
  failOpen: false,
  failRead: false,
  failAfterWrite: false,
  beforeCommit: undefined as (() => Promise<void>) | undefined,
  connections: new Set<{ closeAsync(): Promise<void> }>(),
  scopes: [] as string[],
}));

// Real SQLite executes all SQL and rollback; only Expo's native bridge is substituted.
vi.mock("expo-sqlite", () => ({
  openDatabaseAsync: async (name: string) => {
    if (driver.failOpen) throw new Error("cannot open");
    const path = join(driver.directory, name);
    const queries = (db: DatabaseSync, scope: string) => ({
      async execAsync(sql: string) {
        driver.scopes.push(scope);
        db.exec(sql);
      },
      async getFirstAsync(sql: string, ...params: SQLInputValue[]) {
        driver.scopes.push(scope);
        if (driver.failRead) throw new Error("read failed");
        return db.prepare(sql).get(...params) ?? null;
      },
      async runAsync(sql: string, ...params: SQLInputValue[]) {
        driver.scopes.push(scope);
        const result = db.prepare(sql).run(...params);
        if (driver.failAfterWrite) throw new Error("write interrupted");
        return result;
      },
    });
    const db = new DatabaseSync(path);
    const api = {
      ...queries(db, "connection"),
      async withExclusiveTransactionAsync(
        task: (transaction: ReturnType<typeof queries>) => Promise<void>,
      ) {
        const transactionDb = new DatabaseSync(path);
        try {
          transactionDb.exec("BEGIN");
          await task(queries(transactionDb, "transaction"));
          await driver.beforeCommit?.();
          transactionDb.exec("COMMIT");
        } catch (error) {
          transactionDb.exec("ROLLBACK");
          throw error;
        } finally {
          transactionDb.close();
        }
      },
      async closeAsync() {
        db.close();
        driver.connections.delete(api);
      },
    };
    driver.connections.add(api);
    return api;
  },
}));

import { openSQLiteRecordingStorage } from "./recordingStorageSqlite";
import { openRecordingStorage } from "./recordingStorage";
import { makeRecordingStore } from "@stacks/client-runtime/recording";

beforeEach(() => {
  driver.directory = mkdtempSync(join(tmpdir(), "color-up-sqlite-"));
  driver.failOpen = false;
  driver.failRead = false;
  driver.failAfterWrite = false;
  driver.beforeCommit = undefined;
  driver.scopes = [];
});
afterEach(async () => {
  for (const connection of driver.connections) await connection.closeAsync();
  rmSync(driver.directory, { recursive: true, force: true });
});

it("reopens durable opaque history and isolates namespaces", async () => {
  expect(openRecordingStorage).toBe(openSQLiteRecordingStorage);
  const first = await openSQLiteRecordingStorage("alice");
  const other = await openSQLiteRecordingStorage("bob");
  expect(await first.load()).toEqual({ revision: 0 });
  expect(await first.commit(0, "opaque")).toBe(1);
  expect(await other.load()).toEqual({ revision: 0 });
  await first.close();
  const reopened = await openSQLiteRecordingStorage("alice");
  expect(await reopened.load()).toEqual({ revision: 1, payload: "opaque" });
  expect(await other.commit(0, "other")).toBe(1);
  expect(await reopened.load()).toEqual({ revision: 1, payload: "opaque" });
  await other.close();
  await reopened.close();
});

it("checks CAS and writes on the exclusive transaction connection", async () => {
  const first = await openSQLiteRecordingStorage("self");
  const second = await openSQLiteRecordingStorage("self");
  driver.scopes = [];
  expect(await first.commit(0, "first")).toBe(1);
  expect(driver.scopes.every((scope) => scope === "transaction")).toBe(true);
  await expect(second.commit(0, "stale")).rejects.toMatchObject({
    name: "RecordingStorageConflict",
    expectedRevision: 0,
    actualRevision: 1,
  });
  expect(await second.load()).toEqual({ revision: 1, payload: "first" });
  await first.close();
  await second.close();
});

it("acknowledges and notifies only after COMMIT; close drains accepted operations", async () => {
  const storage = await openSQLiteRecordingStorage("self");
  const observer = await openSQLiteRecordingStorage("self");
  const events: unknown[] = [];
  observer.subscribe((event) => events.push(event));
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  driver.beforeCommit = async () => {
    entered.resolve();
    await release.promise;
  };
  let acknowledged = false;
  const commit = storage.commit(0, "durable").then(() => {
    acknowledged = true;
  });
  await entered.promise;
  expect(acknowledged).toBe(false);
  expect(events).toEqual([]);
  expect(await observer.load()).toEqual({ revision: 0 });
  const closing = storage.close();
  release.resolve();
  await commit;
  await closing;
  expect(events).toEqual([{ type: "commit", revision: 1 }]);
  expect(await observer.load()).toEqual({ revision: 1, payload: "durable" });
  await expect(storage.load()).rejects.toMatchObject({ reason: "closed" });
  await observer.close();
});

it("rolls back interruption after the write and permits explicit recovery", async () => {
  const storage = await openSQLiteRecordingStorage("self");
  await storage.commit(0, "saved");
  const events: unknown[] = [];
  storage.subscribe((event) => events.push(event));
  driver.failAfterWrite = true;
  await expect(storage.commit(1, "lost")).rejects.toMatchObject({ reason: "write" });
  driver.failAfterWrite = false;
  expect(await storage.load()).toEqual({ revision: 1, payload: "saved" });
  expect(events).toEqual([]);
  expect(await storage.commit(1, "recovered")).toBe(2);
  await storage.close();
});

it("rolls back a failed transaction completion", async () => {
  const storage = await openSQLiteRecordingStorage("self");
  await storage.commit(0, "saved");
  driver.beforeCommit = async () => {
    throw new Error("commit failed");
  };
  await expect(storage.commit(1, "lost")).rejects.toMatchObject({ reason: "write" });
  expect(await storage.load()).toEqual({ revision: 1, payload: "saved" });
  await storage.close();
});

it("reports failed open and failed reads without creating empty history", async () => {
  driver.failOpen = true;
  await expect(openSQLiteRecordingStorage("self")).rejects.toMatchObject({ reason: "open" });
  driver.failOpen = false;
  const storage = await openSQLiteRecordingStorage("self");
  await storage.commit(0, "saved");
  driver.failRead = true;
  await expect(storage.load()).rejects.toMatchObject({ reason: "read" });
  await expect(storage.commit(1, "lost")).rejects.toMatchObject({ reason: "write" });
  driver.failRead = false;
  expect(await storage.load()).toEqual({ revision: 1, payload: "saved" });
  await storage.close();
});

it("rejects corrupt stored revisions and does not overwrite them", async () => {
  const storage = await openSQLiteRecordingStorage("self");
  const db = new DatabaseSync(join(driver.directory, "color-up-recording.db"));
  db.exec("PRAGMA ignore_check_constraints = ON");
  db.prepare("INSERT INTO recording_documents(namespace, revision, payload) VALUES (?, ?, ?)").run(
    "self",
    -1,
    "history",
  );
  await expect(storage.load()).rejects.toMatchObject({ reason: "corrupt" });
  await expect(storage.commit(0, "lost")).rejects.toMatchObject({ reason: "corrupt" });
  expect(
    db.prepare("SELECT payload FROM recording_documents WHERE namespace = ?").get("self"),
  ).toMatchObject({ payload: "history" });
  db.close();
  await storage.close();
});

it("disposes subscriptions and connections without crossing namespaces", async () => {
  const storage = await openSQLiteRecordingStorage("self");
  const other = await openSQLiteRecordingStorage("other");
  const events: unknown[] = [];
  const unsubscribe = storage.subscribe((event) => events.push(event));
  await other.commit(0, "other");
  unsubscribe();
  await storage.commit(0, "self");
  storage.subscribe((event) => events.push(event));
  await storage.close();
  await storage.close();
  expect(events).toEqual([]);
  expect(driver.connections.size).toBe(1);
  await expect(storage.commit(1, "closed")).rejects.toMatchObject({ reason: "closed" });
  await other.close();
  expect(driver.connections.size).toBe(0);
});

it("never loses a concurrent native write; lock failures remain visible and stale reloads conflict", async () => {
  const first = await openSQLiteRecordingStorage("self");
  const second = await openSQLiteRecordingStorage("self");
  const results = await Promise.allSettled([first.commit(0, "first"), second.commit(0, "second")]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const rejected = results.find((result) => result.status === "rejected");
  expect(rejected).toMatchObject({ status: "rejected", reason: { reason: "write" } });
  expect((await first.load()).revision).toBe(1);
  expect(await first.load()).toEqual(await second.load());
  await expect(second.commit(0, "stale")).rejects.toMatchObject({
    name: "RecordingStorageConflict",
    expectedRevision: 0,
    actualRevision: 1,
  });
  await first.close();
  await second.close();
});

it("runs private recording through real SQLite across reopen and a rolled-back finish", async () => {
  const open = async () => {
    const store = makeRecordingStore(await openRecordingStorage("runtime"));
    await store.ready;
    return store;
  };
  let store = await open();
  const identity = store.getSnapshot().state!.self;
  await store.execute(store.prepare({ type: "start", buyIn: 20000 }));
  await store.close();
  store = await open();
  const visitId = store.getSnapshot().state!.visits[0]!.id;
  await store.execute(store.prepare({ type: "add", visitId, kind: "buy_in", amount: 10000 }));
  await store.close();
  store = await open();
  await store.execute(store.prepare({ type: "add", visitId, kind: "cash_out", amount: 10000 }));
  await store.close();
  store = await open();
  const finish = store.prepare({ type: "finish", visitId, amount: 25000 });
  const before = store.getSnapshot();
  driver.failAfterWrite = true;
  await expect(store.execute(finish)).rejects.toMatchObject({ reason: "write" });
  expect(store.getSnapshot().state).toEqual(before.state);
  driver.failAfterWrite = false;
  await store.close();
  store = await open();
  expect(store.review(visitId).summary.finalResult).toBeNull();
  const receipt = await store.execute(finish);
  await store.close();
  store = await open();
  expect(store.review(visitId).summary).toMatchObject({
    totals: { buyIn: 30000, cashOut: 35000 },
    finalResult: 5000,
  });
  expect(store.getSnapshot()).toMatchObject({ publication: "private", state: { self: identity } });
  expect(store.getSnapshot().state!.receipts.at(-1)).toEqual(receipt);
  await store.close();
});
