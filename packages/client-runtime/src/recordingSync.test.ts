import { describe, expect, it } from "@effect/vitest";
import { ActorId, PlayerId, UserId } from "@stacks/contracts";
import type {
  PushRecordingRequest,
  RecordingCommandResult,
  RecordingHistory,
  RecordingIdentity,
} from "@stacks/contracts/recordingCommands";
import {
  applyRecordingCommand,
  RecordingError,
  type RecordingLedger,
} from "@stacks/shared/recording";
import { visitSummary } from "@stacks/shared/visits";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Queue from "effect/Queue";
import * as TestClock from "effect/testing/TestClock";

import { makeRecordingStore, prepareRecordingCommand, type RecordingStore } from "./recording.ts";
import { decodeRecordingState, type RecordingState } from "./recordingState.ts";
import type { RecordingStorage, RecordingStorageDocument } from "./recordingStorage.ts";
import {
  applyPushResults,
  discardRejected,
  makeRecordingSync,
  mergeRecordingHistory,
  pendingRecordingCommands,
  recordRejectedAgain,
  RecordingSyncBlocked,
  type RecordingTransport,
} from "./recordingSync.ts";
import { recordingSyncView } from "./recordingView.ts";

const alex = UserId.make("user_alex");
const at = (hour: number) =>
  DateTime.makeUnsafe(`2026-11-06T${hour.toString().padStart(2, "0")}:00:00.000Z`);

const memory = () => {
  let document: RecordingStorageDocument = { revision: 0 };
  const adapter: RecordingStorage = {
    load: async () => document,
    commit: async (expected, payload) => {
      if (document.revision !== expected) throw new Error("conflict");
      document = { revision: expected + 1, payload };
      return document.revision;
    },
    subscribe: () => () => undefined,
    close: async () => undefined,
  };
  return {
    adapter,
    get document() {
      return document;
    },
  };
};

const open = async (db = memory()) => {
  const store = makeRecordingStore(db.adapter);
  await store.ready;
  return store;
};
const save = (store: RecordingStore, input: Parameters<RecordingStore["prepare"]>[0]) =>
  store.execute(store.prepare(input));
const state = (store: RecordingStore) => store.getSnapshot().state!;

/** The API's rules in memory: one account, applying each command once. */
const server = () => {
  let ledger: RecordingLedger | null = null;
  const applied = new Map<string, string>();
  const refuse = new Set<string>();
  const push = (request: PushRecordingRequest) => {
    ledger ??= {
      self: { id: request.identity.playerId, displayName: "You" },
      actor: { id: request.identity.actorId, userId: alex },
      tables: [],
      visits: [],
      entries: [],
      receipts: [],
    };
    if (ledger.self.id !== request.identity.playerId) throw new Error("identity conflict");
    return request.commands.map((command): RecordingCommandResult => {
      const text = JSON.stringify(command);
      if (applied.has(command.operationId))
        return applied.get(command.operationId) === text
          ? { operationId: command.operationId, status: "accepted" }
          : {
              operationId: command.operationId,
              status: "rejected",
              reason: "operation_reused",
              message: "reused",
            };
      if (refuse.has(command.operationId))
        return {
          operationId: command.operationId,
          status: "rejected",
          reason: "conflict",
          message: "Visit changed. Review it before preparing another command.",
        };
      try {
        ledger = applyRecordingCommand(ledger!, command);
        applied.set(command.operationId, text);
        return { operationId: command.operationId, status: "accepted" };
      } catch (error) {
        if (!(error instanceof RecordingError) || error.reason === "operation_reused") throw error;
        return {
          operationId: command.operationId,
          status: "rejected",
          reason: error.reason === "conflict" ? "conflict" : "invalid",
          message: error.message,
        };
      }
    });
  };
  const history = (): RecordingHistory =>
    ledger
      ? {
          identity: { playerId: ledger.self.id, actorId: ledger.actor.id },
          commands: ledger.receipts.map((receipt) => receipt.command),
          tables: ledger.tables,
          visits: ledger.visits,
          entries: ledger.entries,
        }
      : { identity: null, commands: [], tables: [], visits: [], entries: [] };
  return { push, history, refuse: (id: string) => refuse.add(id) };
};

const transportFor = (remote: ReturnType<typeof server>): RecordingTransport => ({
  history: Effect.sync(remote.history),
  push: (request) => Effect.sync(() => ({ results: remote.push(request) })),
});

/** What another device recorded under `identity`, as the server returns it. */
const otherDevice = (identity: RecordingIdentity) => {
  let ledger: RecordingState = {
    version: 1,
    self: { id: identity.playerId, displayName: "You" },
    actor: { id: identity.actorId, userId: null },
    tables: [],
    visits: [],
    entries: [],
    receipts: [],
  };
  const record = (input: Parameters<typeof prepareRecordingCommand>[1]) => {
    const command = prepareRecordingCommand(ledger, input);
    ledger = applyRecordingCommand(ledger, command);
    return command;
  };
  return { record, commands: () => ledger.receipts.map((receipt) => receipt.command) };
};

const pushAll = async (store: RecordingStore, remote: ReturnType<typeof server>) => {
  const current = state(store);
  const results = remote.push({
    identity: { playerId: current.self.id, actorId: current.actor.id },
    commands: pendingRecordingCommands(current),
  });
  await store.transform((s) => applyPushResults(s, results));
};

describe("merging", () => {
  it("uploads signed-out play to the account that signs in and survives a relaunch", async () => {
    const db = memory();
    const store = await open(db);
    await save(store, { type: "start", buyIn: 20000, startedAt: at(10) });
    const visitId = state(store).visits[0]!.id;
    await save(store, { type: "add", visitId, kind: "buy_in", amount: 10000, occurredAt: at(11) });
    expect(state(store).sync).toBeUndefined();

    const remote = server();
    await store.transform((s) => mergeRecordingHistory(s, alex, remote.history()));
    expect(pendingRecordingCommands(state(store))).toHaveLength(2);
    await pushAll(store, remote);
    expect(pendingRecordingCommands(state(store))).toEqual([]);
    expect(state(store).sync?.synced).toHaveLength(2);
    expect(remote.history().identity).toEqual({
      playerId: state(store).self.id,
      actorId: state(store).actor.id,
    });

    // A rebuy after sync is pending until it's pushed; all of it reloads from storage.
    await save(store, { type: "add", visitId, kind: "buy_in", amount: 5000, occurredAt: at(12) });
    const reloaded = decodeRecordingState(db.document.payload!, db.document.revision);
    expect(pendingRecordingCommands(reloaded).map((c) => c.type)).toEqual(["add"]);
    expect(reloaded.sync?.synced).toHaveLength(2);
  });

  it("adopts the account's player on a second device and restores its history", async () => {
    const identity = {
      playerId: PlayerId.make(crypto.randomUUID()),
      actorId: ActorId.make(crypto.randomUUID()),
    };
    const first = otherDevice(identity);
    first.record({
      type: "record_completed",
      buyIn: 30000,
      cashOut: 35000,
      startedAt: at(1),
      finishedAt: at(3),
    });
    const remote = server();
    remote.push({ identity, commands: first.commands() });

    const store = await open();
    await save(store, { type: "start", buyIn: 20000, startedAt: at(10) });
    const localVisit = state(store).visits[0]!.id;
    await store.transform((s) => mergeRecordingHistory(s, alex, remote.history()));

    const merged = state(store);
    expect(merged.self.id).toBe(identity.playerId);
    expect(merged.actor.id).toBe(identity.actorId);
    expect(merged.visits.map((visit) => visit.id)).toContain(localVisit);
    expect(merged.visits).toHaveLength(2);
    expect(merged.entries.every((entry) => entry.createdBy === identity.actorId)).toBe(true);
    const restored = merged.visits.find((visit) => visit.id !== localVisit)!;
    expect(visitSummary(restored, merged.entries).finalResult).toBe(5000);
    expect(pendingRecordingCommands(merged).map((c) => c.type)).toEqual(["start"]);

    await pushAll(store, remote);
    expect(remote.history().visits).toHaveLength(2);
  });

  it("won't mix one account's device history into another's", async () => {
    const store = await open();
    await store.transform((s) => mergeRecordingHistory(s, alex, server().history()));
    const bea = UserId.make("user_bea");
    await expect(
      store.transform((s) => mergeRecordingHistory(s, bea, server().history())),
    ).rejects.toBeInstanceOf(RecordingSyncBlocked);
  });
});

describe("rejections", () => {
  const rejectedSetup = async () => {
    const store = await open();
    const remote = server();
    await store.transform((s) => mergeRecordingHistory(s, alex, remote.history()));
    await save(store, { type: "start", buyIn: 20000, startedAt: at(10) });
    const visitId = state(store).visits[0]!.id;
    await pushAll(store, remote);
    const rebuy = store.prepare({
      type: "add",
      visitId,
      kind: "buy_in",
      amount: 10000,
      occurredAt: at(11),
    });
    await store.execute(rebuy);
    const cashOut = await save(store, {
      type: "finish",
      visitId,
      amount: 25000,
      finishedAt: at(12),
    });
    remote.refuse(rebuy.operationId);
    await pushAll(store, remote);
    return { store, remote, visitId, rebuy, cashOut: cashOut.command };
  };

  it("keeps a refused change and what depended on it out of the ledger but visible", async () => {
    const { store, visitId, rebuy, cashOut } = await rejectedSetup();
    const current = state(store);
    expect(current.sync?.rejected.map((item) => [item.command.operationId, item.reason])).toEqual([
      [rebuy.operationId, "conflict"],
      [cashOut.operationId, "conflict"],
    ]);
    const visit = current.visits.find((item) => item.id === visitId)!;
    expect(visitSummary(visit, current.entries).totals.buyIn).toBe(20000);
    expect(visit.finishedAt).toBeNull();
    expect(pendingRecordingCommands(current)).toEqual([]);
  });

  it("says what was refused, on Home and on its session only", async () => {
    const { store, visitId } = await rejectedSetup();
    const idle = { phase: "idle", error: null } as const;
    const home = recordingSyncView(state(store), idle);
    expect(home.line).toEqual({ kind: "synced", text: "Synced to your account" });
    expect(home.rejected.map((item) => item.sentence)).toEqual([
      "A $100 buy-in didn't sync. The session changed on another device.",
      "Finishing with $250 didn't sync. The session changed on another device.",
    ]);
    expect(recordingSyncView(state(store), idle, visitId).rejected).toHaveLength(2);
    expect(recordingSyncView(state(store), idle, crypto.randomUUID() as never).rejected).toEqual(
      [],
    );
    expect(recordingSyncView(state(store), null).line.text).toBe("Saved on this device");

    await save(store, { type: "add", visitId, kind: "buy_in", amount: 100, occurredAt: at(13) });
    expect(recordingSyncView(state(store), { phase: "retrying", error: null }).line.text).toBe(
      "Saved on this device. 1 change will sync once Color Up can be reached.",
    );
  });

  it("records a refused change again as a new command, or discards it", async () => {
    const { store, remote, visitId, rebuy, cashOut } = await rejectedSetup();
    await store.transform((s) => recordRejectedAgain(s, rebuy.operationId));
    const again = pendingRecordingCommands(state(store));
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ type: "add", amount: 10000, expectedRevision: 0 });
    expect(again[0]!.operationId).not.toBe(rebuy.operationId);

    await store.transform((s) => discardRejected(s, cashOut.operationId));
    expect(state(store).sync?.rejected).toEqual([]);
    await pushAll(store, remote);
    const synced = remote.history();
    expect(
      visitSummary(
        synced.visits.find((v) => v.id === visitId)!,
        synced.entries,
      ).totals.buyIn,
    ).toBe(30000);
  });

  it("keeps the refusal when recording it again still breaks a rule", async () => {
    const { store, visitId, cashOut } = await rejectedSetup();
    await save(store, { type: "finish", visitId, amount: 0, finishedAt: at(13) });
    await expect(
      store.transform((s) => recordRejectedAgain(s, cashOut.operationId)),
    ).rejects.toThrow("This visit has finished");
    expect(state(store).sync?.rejected).toHaveLength(2);
  });
});

describe("engine", () => {
  it.effect("backs off on the test clock, and a wake cuts the wait short", () =>
    Effect.gen(function* () {
      const store = yield* Effect.promise(() => open());
      yield* Effect.promise(() => save(store, { type: "start", buyIn: 20000, startedAt: at(10) }));
      const remote = server();
      const calls = yield* Queue.unbounded<string>();
      let offline = 3;
      const transport: RecordingTransport = {
        history: Effect.suspend(() => {
          Queue.offerUnsafe(calls, "history");
          return offline-- > 0 ? Effect.fail(new Error("offline")) : Effect.sync(remote.history);
        }),
        push: (request) => {
          Queue.offerUnsafe(calls, "push");
          return Effect.sync(() => ({ results: remote.push(request) }));
        },
      };
      const sync = makeRecordingSync(store, alex, transport);
      const statuses = yield* Queue.unbounded<string>();
      sync.subscribe(() => Queue.offerUnsafe(statuses, sync.getStatus().phase));
      const fiber = yield* Effect.forkChild(sync.run);
      const retrying = Effect.gen(function* () {
        while ((yield* Queue.take(statuses)) !== "retrying");
      });

      expect(yield* Queue.take(calls)).toBe("history");
      yield* retrying;
      yield* TestClock.adjust("999 millis");
      expect(yield* Queue.size(calls)).toBe(0);
      yield* TestClock.adjust("1 millis");
      expect(yield* Queue.take(calls)).toBe("history");
      yield* retrying;
      yield* TestClock.adjust("1999 millis");
      expect(yield* Queue.size(calls)).toBe(0);
      sync.wake();
      expect(yield* Queue.take(calls)).toBe("history");
      yield* retrying;
      yield* TestClock.adjust("4 seconds");
      expect(yield* Queue.take(calls)).toBe("history");
      expect(yield* Queue.take(calls)).toBe("push");
      while ((yield* Queue.take(statuses)) !== "idle");
      expect(pendingRecordingCommands(state(store))).toEqual([]);
      expect(remote.history().visits).toHaveLength(1);

      // A new save while signed in pushes without waiting for a wake.
      const visitId = state(store).visits[0]!.id;
      yield* Effect.promise(() =>
        save(store, { type: "add", visitId, kind: "cash_out", amount: 5000, occurredAt: at(11) }),
      );
      expect(yield* Queue.take(calls)).toBe("push");
      while ((yield* Queue.take(statuses)) !== "idle");
      expect(remote.history().entries).toHaveLength(2);
      yield* Fiber.interrupt(fiber);
    }),
  );

  it.effect("stops for a person when the device belongs to another account", () =>
    Effect.gen(function* () {
      const store = yield* Effect.promise(() => open());
      yield* Effect.promise(() =>
        store.transform((s) =>
          mergeRecordingHistory(s, UserId.make("user_bea"), server().history()),
        ),
      );
      const sync = makeRecordingSync(store, alex, transportFor(server()));
      const statuses = yield* Queue.unbounded<string>();
      sync.subscribe(() => Queue.offerUnsafe(statuses, sync.getStatus().phase));
      const fiber = yield* Effect.forkChild(sync.run);
      while ((yield* Queue.take(statuses)) !== "blocked");
      expect(sync.getStatus().error).toBeInstanceOf(RecordingSyncBlocked);
      yield* Fiber.interrupt(fiber);
    }),
  );
});
