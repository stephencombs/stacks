import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { ActorId, EntryId, PlayerId, TableId, VisitId } from "@stacks/contracts";
import {
  RecordingCommand,
  RecordingOperationId,
  type RecordingIdentity,
} from "@stacks/contracts/recordingCommands";
import { visitSummary } from "@stacks/shared/visits";

import { usd, users } from "../testing/fixtures.ts";
import { TestApi } from "../testing/TestApi.ts";

const uuid = () => crypto.randomUUID();
const at = (minutes: number) => DateTime.makeUnsafe(Date.UTC(2026, 10, 7, 20, minutes));

const device = (): RecordingIdentity => ({
  playerId: PlayerId.make(uuid()),
  actorId: ActorId.make(uuid()),
});

const start = (identity: RecordingIdentity, buyIn = 20000) => {
  const command = RecordingCommand.make({
    type: "start",
    operationId: RecordingOperationId.make(uuid()),
    actorId: identity.actorId,
    preparedAt: at(0),
    tableId: TableId.make(uuid()),
    visitId: VisitId.make(uuid()),
    buyInId: EntryId.make(uuid()),
    buyIn: usd(buyIn),
    startedAt: at(0),
    game: "blackjack",
    venueId: null,
    highLimit: false,
  });
  return command as Extract<RecordingCommand, { type: "start" }>;
};

const add = (
  identity: RecordingIdentity,
  visitId: VisitId,
  expectedRevision: number,
  amount: number,
  kind: "buy_in" | "cash_out" = "buy_in",
) =>
  RecordingCommand.make({
    type: "add",
    operationId: RecordingOperationId.make(uuid()),
    actorId: identity.actorId,
    preparedAt: at(10 + expectedRevision),
    visitId,
    expectedRevision,
    entryId: EntryId.make(uuid()),
    kind,
    amount: usd(amount),
    occurredAt: at(10 + expectedRevision),
    note: null,
  }) as Extract<RecordingCommand, { type: "add" }>;

const finish = (
  identity: RecordingIdentity,
  visitId: VisitId,
  expectedRevision: number,
  amount: number,
) =>
  RecordingCommand.make({
    type: "finish",
    operationId: RecordingOperationId.make(uuid()),
    actorId: identity.actorId,
    preparedAt: at(30),
    visitId,
    expectedRevision,
    entryId: EntryId.make(uuid()),
    amount: usd(amount),
    finishedAt: at(30),
  });

it.layer(TestApi.layer, { timeout: "30 seconds" })("recording", (it) => {
  it.effect("applies the first milestone and restores it from history", () =>
    Effect.gen(function* () {
      const { alex } = yield* users("alex");
      const identity = device();
      const opened = start(identity);
      const commands = [
        opened,
        add(identity, opened.visitId, 0, 10000),
        add(identity, opened.visitId, 1, 10000, "cash_out"),
        finish(identity, opened.visitId, 2, 25000),
      ];
      const pushed = yield* alex.recording.push({ payload: { identity, commands } });
      expect(pushed.results.map((result) => result.status)).toEqual([
        "accepted",
        "accepted",
        "accepted",
        "accepted",
      ]);

      const history = yield* alex.recording.history();
      expect(history.identity).toEqual(identity);
      expect(history.commands.map((command) => command.operationId)).toEqual(
        commands.map((command) => command.operationId),
      );
      expect(history.tables).toMatchObject([{ id: opened.tableId, game: "blackjack" }]);
      const summary = visitSummary(history.visits[0]!, history.entries);
      expect(summary.totals).toEqual({ buyIn: 30000, cashOut: 35000, adjustment: 0 });
      expect(summary.finalResult).toBe(5000);
      expect(history.visits[0]).toMatchObject({ playerId: identity.playerId, revision: 3 });
    }),
  );

  it.effect("treats a retry with the same content as done and refuses reused IDs", () =>
    Effect.gen(function* () {
      const { alex } = yield* users("alex");
      const identity = device();
      const opened = start(identity);
      const rebuy = add(identity, opened.visitId, 0, 10000);
      yield* alex.recording.push({ payload: { identity, commands: [opened, rebuy] } });

      const retried = yield* alex.recording.push({
        payload: { identity, commands: [opened, rebuy] },
      });
      expect(retried.results.every((result) => result.status === "accepted")).toBe(true);
      const history = yield* alex.recording.history();
      expect(history.entries).toHaveLength(2);
      expect(history.commands).toHaveLength(2);

      const altered = RecordingCommand.make({ ...rebuy, amount: usd(5000) });
      const refused = yield* alex.recording.push({ payload: { identity, commands: [altered] } });
      expect(refused.results).toEqual([
        expect.objectContaining({ status: "rejected", reason: "operation_reused" }),
      ]);
      expect((yield* alex.recording.history()).entries).toHaveLength(2);
    }),
  );

  it.effect("rejects commands the shared rules refuse and keeps nothing from them", () =>
    Effect.gen(function* () {
      const { alex } = yield* users("alex");
      const identity = device();
      const opened = start(identity);
      const stale = add(identity, opened.visitId, 3, 10000);
      const finished = finish(identity, opened.visitId, 0, 0);
      const late = add(identity, opened.visitId, 1, 10000);
      const missing = add(identity, VisitId.make(uuid()), 0, 10000);
      const { results } = yield* alex.recording.push({
        payload: { identity, commands: [opened, stale, finished, late, missing] },
      });
      expect(
        results.map((result) => (result.status === "rejected" ? result.reason : "ok")),
      ).toEqual(["ok", "conflict", "ok", "invalid", "invalid"]);
      expect(results[3]).toMatchObject({
        message: "This visit has finished. Start a new visit when returning.",
      });

      const history = yield* alex.recording.history();
      expect(history.commands.map((command) => command.operationId)).toEqual([
        opened.operationId,
        finished.operationId,
      ]);
      expect(history.entries).toHaveLength(2);

      // A rejected operation left no trace, so its ID still works once it's valid.
      const fixed = RecordingCommand.make({ ...stale, expectedRevision: 2 });
      const reopened = RecordingCommand.make({
        type: "reopen",
        operationId: RecordingOperationId.make(uuid()),
        actorId: identity.actorId,
        preparedAt: at(40),
        visitId: opened.visitId,
        expectedRevision: 1,
        reason: "Finished by mistake",
      });
      const retried = yield* alex.recording.push({
        payload: { identity, commands: [reopened, fixed] },
      });
      expect(retried.results.map((result) => result.status)).toEqual(["accepted", "accepted"]);
      const after = yield* alex.recording.history();
      const voided = after.entries.filter((entry) => entry.voidedAt !== null);
      expect(voided).toMatchObject([{ kind: "cash_out", voidReason: "Finished by mistake" }]);
      expect(after.visits[0]).toMatchObject({ finishedAt: null, revision: 3 });
    }),
  );

  it.effect("keeps each account's recording to its owner", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const alexDevice = device();
      const opened = start(alexDevice);
      yield* alex.recording.push({ payload: { identity: alexDevice, commands: [opened] } });

      const empty = yield* bea.recording.history();
      expect(empty).toEqual({ identity: null, commands: [], tables: [], visits: [], entries: [] });

      // Bea can't borrow Alex's identity, and her own can't reach his visit or operations.
      const borrowed = yield* bea.recording
        .push({
          payload: { identity: alexDevice, commands: [add(alexDevice, opened.visitId, 0, 100)] },
        })
        .pipe(Effect.flip);
      expect(borrowed).toMatchObject({ _tag: "Conflict", reason: "recording_identity" });

      const beaDevice = device();
      const { results } = yield* bea.recording.push({
        payload: {
          identity: beaDevice,
          commands: [
            add(beaDevice, opened.visitId, 0, 100),
            RecordingCommand.make({ ...start(beaDevice), operationId: opened.operationId }),
            RecordingCommand.make({ ...start(beaDevice), visitId: opened.visitId }),
          ],
        },
      });
      expect(
        results.map((result) => (result.status === "rejected" ? result.reason : "ok")),
      ).toEqual(["invalid", "operation_reused", "invalid"]);
      expect((yield* bea.recording.history()).visits).toEqual([]);
      expect((yield* alex.recording.history()).entries).toHaveLength(1);
    }),
  );

  it.effect("asks a second device to adopt the identity the first one established", () =>
    Effect.gen(function* () {
      const { alex } = yield* users("alex");
      const first = device();
      yield* alex.recording.push({ payload: { identity: first, commands: [start(first)] } });
      const second = device();
      const refused = yield* alex.recording
        .push({ payload: { identity: second, commands: [start(second)] } })
        .pipe(Effect.flip);
      expect(refused).toMatchObject({ _tag: "Conflict", reason: "recording_identity" });
      expect((yield* alex.recording.history()).identity).toEqual(first);
    }),
  );

  it.effect("doesn't let personal recording appear in any group", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const alex = yield* api.as(`alex_${uuid().slice(0, 8)}`);
      const identity = device();
      yield* alex.recording.push({ payload: { identity, commands: [start(identity)] } });
      expect(yield* alex.groups.list()).toEqual([]);
    }),
  );
});
