import * as Match from "effect/Match";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface SqliteDriver {
  directory: string;
  failOpen: boolean;
  failRead: boolean;
  failAfterWrite: boolean;
  beforeCommit: (() => Promise<void>) | undefined;
  connections: Set<{ closeAsync(): Promise<void> }>;
  scopes: string[];
}

const driver = vi.hoisted(() => {
  const state: SqliteDriver = {
    directory: "",
    failOpen: false,
    failRead: false,
    failAfterWrite: false,
    beforeCommit: undefined,
    connections: new Set<{ closeAsync(): Promise<void> }>(),
    scopes: [],
  };

  return state;
});

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
import { makeRecordingStore, type CachedVenue } from "@stacks/client-runtime/recording";
import { VenueId } from "@stacks/contracts";

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

const openStore = async () => {
  const store = makeRecordingStore(await openRecordingStorage("runtime"));
  await store.ready;

  return store;
};

const bellagio: CachedVenue = {
  id: VenueId.make("0192e7a0-0000-7000-8000-0000000000b1"),
  name: "Bellagio",
  kind: "casino",
  city: "Las Vegas",
  region: "NV",
  country: "US",
  lat: 36.11,
  lng: -115.17,
};

it.each(["start", "finish", "correct", "venue"] as const)(
  "%s rolls back an interrupted SQLite write and retries the identical command",
  async (operation) => {
    let store = await openStore();

    if (operation !== "start") await store.execute(store.prepare({ type: "start", buyIn: 20000 }));
    const before = store.getSnapshot();
    const state = before.state!;

    const command = Match.value(operation).pipe(
      Match.when("start", () => store.prepare({ type: "start", buyIn: 20000 })),
      Match.when("finish", () =>
        store.prepare({ type: "finish", visitId: state.visits[0]!.id, amount: 25000 }),
      ),
      Match.when("venue", () =>
        store.prepare({
          type: "edit_visit",
          visitId: state.visits[0]!.id,
          table: { game: null, venueId: bellagio.id, highLimit: false },
        }),
      ),
      Match.orElse(() =>
        store.prepare({
          type: "correct",
          visitId: state.visits[0]!.id,
          entryId: state.entries[0]!.id,
          reason: "wrong amount",
          replacement: { amount: 18000 },
        }),
      ),
    );

    driver.failAfterWrite = true;
    await expect(
      store.execute(command, operation === "venue" ? [bellagio] : []),
    ).rejects.toMatchObject({ reason: "write" });
    driver.failAfterWrite = false;
    expect(store.getSnapshot()).toMatchObject({
      status: "save_failed",
      revision: before.revision,
      state: before.state,
      failedCommand: { operationId: command.operationId },
    });

    const receipt = await store.retry();
    expect(receipt.command.operationId).toBe(command.operationId);
    expect(store.getSnapshot()).toMatchObject({ status: "saved", failedCommand: null });
    await store.close();

    store = await openStore();
    const saved = store.getSnapshot().state!;
    expect(saved.receipts.at(-1)).toEqual(receipt);
    expect(
      saved.receipts.filter((r) => r.command.operationId === command.operationId),
    ).toHaveLength(1);

    if (operation === "venue") {
      expect(saved.venues).toMatchObject([{ id: bellagio.id, name: "Bellagio" }]);
      expect(saved.tables[0]!.venueId).toBe(bellagio.id);
    }

    await store.close();
  },
);

it("refuses with nothing to retry", async () => {
  const store = await openStore();
  await expect(store.retry()).rejects.toMatchObject({ reason: "invalid" });
  await store.close();
});

it("exposes an unsupported saved document without replacing history", async () => {
  const store = await openStore();
  await store.execute(store.prepare({ type: "start", buyIn: 20000 }));
  await store.close();
  const storage = await openRecordingStorage("runtime");
  const saved = await storage.load();
  const payload = JSON.parse(saved.payload!);
  payload.version = 99;
  const future = JSON.stringify(payload);
  await storage.commit(saved.revision, future);

  const refused = makeRecordingStore(storage);
  await expect(refused.ready).rejects.toMatchObject({ reason: "load" });
  expect(refused.getSnapshot()).toMatchObject({ state: null, status: "load_failed" });
  expect(await storage.load()).toEqual({ revision: saved.revision + 1, payload: future });
  await refused.close();
});
