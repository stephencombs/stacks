import { expect } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { ActorId, EntryId, PlayerId, TableId, VisitId } from "@stacks/contracts";
import {
  RecordingCommand,
  RecordingOperationId,
  type RecordingIdentity,
  type TableDetails,
} from "@stacks/contracts/recordingCommands";

import { usd } from "./fixtures.ts";
import { TestApi } from "./TestApi.ts";

export const uuid = () => crypto.randomUUID();
export const at = (minutes: number) => DateTime.makeUnsafe(Date.UTC(2026, 10, 7, 20, minutes));
const secret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

type Client = Effect.Success<ReturnType<TestApi["Service"]["as"]>>;

const recorder = (identity: RecordingIdentity, client: Client) => {
  const push = (...commands: ReadonlyArray<RecordingCommand>) =>
    client.recording
      .push({ payload: { identity, commands: [commands[0]!, ...commands.slice(1)] } })
      .pipe(
        Effect.map(({ results }) =>
          results.map((result) => (result.status === "rejected" ? result.reason : result.status)),
        ),
      );
  const join = (token: string, player = { id: PlayerId.make(uuid()), displayName: "Bea" }) =>
    client.recording.join({ params: { token }, payload: { identity, player } });
  const redeem = (token: string) =>
    client.recording.redeemInvite({ params: { token }, payload: { identity } });
  return { identity, client, push, join, redeem };
};

const newIdentity = (): RecordingIdentity => ({
  playerId: PlayerId.make(uuid()),
  actorId: ActorId.make(uuid()),
});

/** A signed-out device, recording as its own registered actor. */
export const device = Effect.fn("test.device")(function* () {
  const api = yield* TestApi;
  const identity = newIdentity();
  const credential = { actorId: identity.actorId, secret: secret() };
  yield* (yield* api.asActor(null)).publicRecording.registerActor({ payload: credential });
  return { ...recorder(identity, yield* api.asActor(credential)), credential };
});

/**
 * An account on one of its devices: `handle` is its sign-in, so two calls are two devices of one
 * account. `identity` is what that device records as; a device signing in to an account that has
 * recorded already must use the account's.
 */
export const signedIn = Effect.fn("test.signedIn")(function* (
  handle: string,
  identity: RecordingIdentity = newIdentity(),
) {
  const api = yield* TestApi;
  return recorder(identity, yield* api.as(handle));
});

/** A signed-in account, recording as its account actor. */
export const account = Effect.fn("test.account")(function* (name: string) {
  const api = yield* TestApi;
  return recorder(newIdentity(), yield* api.as(`${name}_${uuid().slice(0, 8)}`));
});

const common = (identity: RecordingIdentity, minutes = 0) => ({
  operationId: RecordingOperationId.make(uuid()),
  actorId: identity.actorId,
  preparedAt: at(minutes),
});

export const start = (identity: RecordingIdentity) =>
  RecordingCommand.make({
    type: "start",
    ...common(identity),
    tableId: TableId.make(uuid()),
    visitId: VisitId.make(uuid()),
    playerId: identity.playerId,
    buyInId: EntryId.make(uuid()),
    buyIn: usd(20000),
    startedAt: at(0),
    game: "blackjack",
    venueId: null,
    highLimit: false,
  }) as Extract<RecordingCommand, { type: "start" }>;

export const sitDown = (
  identity: RecordingIdentity,
  tableId: TableId,
  playerId: PlayerId,
  minutes = 5,
) =>
  RecordingCommand.make({
    type: "join_table",
    ...common(identity, minutes),
    tableId,
    visitId: VisitId.make(uuid()),
    playerId,
    buyInId: EntryId.make(uuid()),
    buyIn: usd(10000),
    startedAt: at(minutes),
  }) as Extract<RecordingCommand, { type: "join_table" }>;

/** The starter seats a player they name at their table. */
export const seatNew = (identity: RecordingIdentity, tableId: TableId, displayName: string) => {
  const id = PlayerId.make(uuid());
  return RecordingCommand.make({
    ...sitDown(identity, tableId, id),
    newPlayer: { id, displayName },
  }) as Extract<RecordingCommand, { type: "join_table" }>;
};

export const rebuy = (identity: RecordingIdentity, visitId: VisitId, expectedRevision = 0) =>
  RecordingCommand.make({
    type: "add",
    ...common(identity, 10),
    visitId,
    expectedRevision,
    entryId: EntryId.make(uuid()),
    kind: "buy_in",
    amount: usd(5000),
    occurredAt: at(10),
    note: null,
  }) as Extract<RecordingCommand, { type: "add" }>;

export const finish = (identity: RecordingIdentity, visitId: VisitId, expectedRevision = 0) =>
  RecordingCommand.make({
    type: "finish",
    ...common(identity, 20),
    visitId,
    expectedRevision,
    entryId: EntryId.make(uuid()),
    amount: usd(12000),
    finishedAt: at(20),
  });

export const correct = (
  identity: RecordingIdentity,
  visitId: VisitId,
  entryId: EntryId,
  expectedRevision = 0,
) =>
  RecordingCommand.make({
    type: "correct",
    ...common(identity, 30),
    visitId,
    expectedRevision,
    entryId,
    reason: "Wrong amount",
    replacement: { id: EntryId.make(uuid()), amount: usd(9000), occurredAt: at(5), note: null },
  });

/** Changes a visit's start, or its table's details, after the fact. */
export const edit = (
  identity: RecordingIdentity,
  visitId: VisitId,
  expectedRevision: number,
  change: { startedAt?: DateTime.Utc; table?: TableDetails },
) =>
  RecordingCommand.make({
    type: "edit_visit",
    ...common(identity, 40),
    visitId,
    expectedRevision,
    ...change,
  });

export const recorderCommand = (
  type: "appoint_recorder" | "revoke_recorder",
  identity: RecordingIdentity,
  tableId: TableId,
  playerId: PlayerId,
) => RecordingCommand.make({ type, ...common(identity, 1), tableId, playerId });

/** A starter's open, shared table. */
export const sharedTable = Effect.fn("test.sharedTable")(function* () {
  const starter = yield* device();
  const opened = start(starter.identity);
  expect(yield* starter.push(opened)).toEqual(["accepted"]);
  const { token } = yield* starter.client.recording.share({ params: { tableId: opened.tableId } });
  return { starter, opened, token };
});
