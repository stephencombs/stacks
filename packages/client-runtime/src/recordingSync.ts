import type { UserId } from "@stacks/contracts";
import {
  RecordingCommand,
  RecordingOperationId,
  type PushRecordingRequest,
  type PushRecordingResponse,
  type RecordingCommandResult,
  type RecordingHistory,
} from "@stacks/contracts/recordingCommands";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";

import { applyRecordingCommand, RecordingError } from "@stacks/shared/recording";

import { prepareRecordingCommand, type RecordingInput, type RecordingStore } from "./recording.ts";
import type { RecordingRejection, RecordingState } from "./recordingState.ts";

export interface RecordingTransport {
  readonly history: Effect.Effect<RecordingHistory, unknown>;
  readonly push: (request: PushRecordingRequest) => Effect.Effect<PushRecordingResponse, unknown>;
}

/** This device's history belongs to another account, so nothing syncs while this one is in. */
export class RecordingSyncBlocked extends Error {
  override readonly name = "RecordingSyncBlocked";
  constructor() {
    super("The sessions on this device belong to another account.");
  }
}

/** The most commands one push carries; the contract caps a batch at 100. */
const BATCH = 100;

const commandText = (() => {
  const encode = Schema.encodeSync(Schema.toCodecJson(RecordingCommand));
  return (command: RecordingCommand) => JSON.stringify(encode(command));
})();

const rejectionOf = (command: RecordingCommand, error: unknown): RecordingRejection => {
  if (!(error instanceof RecordingError)) throw error;
  return {
    command,
    reason:
      error.reason === "conflict" || error.reason === "operation_reused" ? error.reason : "invalid",
    message: error.message,
  };
};

/** Applies commands in order onto `state`, setting aside the ones the rules now refuse. */
const replay = (state: RecordingState, commands: ReadonlyArray<RecordingCommand>) => {
  const failed: RecordingRejection[] = [];
  let current = state;
  for (const command of commands) {
    try {
      current = applyRecordingCommand(current, command);
    } catch (error) {
      failed.push(rejectionOf(command, error));
    }
  }
  return { state: current, failed };
};

const empty = (state: RecordingState): RecordingState => ({
  ...state,
  tables: [],
  visits: [],
  entries: [],
  receipts: [],
});

/** Saved commands the server hasn't confirmed, oldest first. */
export const pendingRecordingCommands = (state: RecordingState) => {
  const synced = new Set(state.sync?.synced);
  return state.receipts.map((receipt) => receipt.command).filter((c) => !synced.has(c.operationId));
};

/**
 * Links this device's ledger to the account and folds in its server history: the server's
 * commands first, then this device's pending ones. A device that never synced adopts the
 * account's identity, so its history joins the account's instead of becoming a second player.
 */
export const mergeRecordingHistory = (
  state: RecordingState,
  userId: UserId,
  history: RecordingHistory,
): RecordingState => {
  if (state.sync && state.sync.userId !== userId) throw new RecordingSyncBlocked();
  const identity = history.identity;
  const adopt =
    identity !== null &&
    (identity.playerId !== state.self.id || identity.actorId !== state.actor.id);
  if (adopt && (state.sync?.synced.length ?? 0) > 0)
    throw new RecordingError("load", "This device already synced as a different player.");
  const actorId = identity?.actorId ?? state.actor.id;
  const own = (command: RecordingCommand) =>
    adopt ? RecordingCommand.make({ ...command, actorId }) : command;
  const remote = new Map(history.commands.map((command) => [command.operationId, command]));
  const local = state.receipts.map((receipt) => own(receipt.command));
  const reused = local
    .filter((c) => remote.has(c.operationId))
    .filter((c) => commandText(remote.get(c.operationId)!) !== commandText(c))
    .map((command) => rejectionOf(command, new RecordingError("operation_reused", "")));
  const base = empty({
    ...state,
    self: identity ? { ...state.self, id: identity.playerId } : state.self,
    actor: { id: actorId, userId: null },
  });
  const synced = replay(base, history.commands);
  if (synced.failed.length > 0)
    throw new RecordingError("load", "The synced history doesn't follow the recording rules.");
  const merged = replay(
    synced.state,
    local.filter((c) => !remote.has(c.operationId)),
  );
  return {
    ...merged.state,
    sync: {
      userId,
      synced: history.commands.map((command) => command.operationId),
      rejected: [
        // A refusal the server now holds was settled elsewhere; the server's copy wins.
        ...(state.sync?.rejected ?? [])
          .filter((item) => !remote.has(item.command.operationId))
          .map((item) => ({ ...item, command: own(item.command) })),
        ...reused,
        ...merged.failed,
      ],
    },
  };
};

/**
 * Marks what the server accepted, and moves what it refused, with what depended on it locally,
 * aside. A command the server accepted is never refused here, even if it no longer applies on
 * this device: another device changed the visit, so it leaves the ledger until the next pull
 * brings the server's version back.
 */
export const applyPushResults = (
  state: RecordingState,
  results: ReadonlyArray<RecordingCommandResult>,
): RecordingState => {
  const sync = state.sync;
  if (!sync) throw new RecordingError("invalid", "Link an account before syncing.");
  const known = new Set(state.receipts.map((receipt) => receipt.command.operationId));
  const accepted = results
    .filter((result) => result.status === "accepted" && known.has(result.operationId))
    .map((result) => result.operationId);
  const refused = new Map(
    results.flatMap((result) =>
      result.status === "rejected" ? [[result.operationId, result]] : [],
    ),
  );
  const synced = [...new Set([...sync.synced, ...accepted])];
  if (refused.size === 0) return { ...state, sync: { ...sync, synced } };
  const commands = state.receipts.map((receipt) => receipt.command);
  const rebuilt = replay(
    empty(state),
    commands.filter((c) => !refused.has(c.operationId)),
  );
  const rejected = commands.flatMap((command) => {
    const result = refused.get(command.operationId);
    return result?.status === "rejected"
      ? [{ command, reason: result.reason, message: result.message }]
      : [];
  });
  const onServer = new Set(synced);
  const dropped = new Set(rebuilt.failed.map((item) => item.command.operationId));
  return {
    ...rebuilt.state,
    sync: {
      ...sync,
      synced: synced.filter((id) => !dropped.has(id)),
      rejected: [
        ...sync.rejected,
        ...rejected,
        ...rebuilt.failed.filter((item) => !onServer.has(item.command.operationId)),
      ],
    },
  };
};

const optional = <K extends string, V>(key: K, value: V | null) =>
  (value === null ? {} : { [key]: value }) as { [P in K]?: V };

/**
 * What the person recorded, to record again against the ledger as it is now. `ids` maps the
 * visit and entries of a start recorded again to their new IDs.
 */
const inputOf = (command: RecordingCommand, ids: ReadonlyMap<string, string>): RecordingInput => {
  const visitId = (ids.get(command.visitId) ?? command.visitId) as typeof command.visitId;
  switch (command.type) {
    case "start":
    case "record_completed": {
      const start = {
        buyIn: command.buyIn,
        startedAt: command.startedAt,
        highLimit: command.highLimit,
        ...optional("game", command.game),
        ...optional("venueId", command.venueId),
      };
      return command.type === "start"
        ? { type: "start", ...start }
        : {
            type: "record_completed",
            ...start,
            startedAt: command.startedAt,
            cashOut: command.cashOut,
            finishedAt: command.finishedAt,
          };
    }
    case "add":
      return {
        type: "add",
        visitId,
        kind: command.kind,
        amount: command.amount,
        occurredAt: command.occurredAt,
        ...optional("note", command.note),
      };
    case "finish":
      return {
        type: "finish",
        visitId,
        amount: command.amount,
        finishedAt: command.finishedAt,
      };
    case "correct":
      return {
        type: "correct",
        visitId,
        entryId: (ids.get(command.entryId) ?? command.entryId) as typeof command.entryId,
        reason: command.reason,
        replacement: command.replacement && {
          amount: command.replacement.amount,
          occurredAt: command.replacement.occurredAt,
          ...optional("note", command.replacement.note),
        },
      };
    case "reopen":
      return { type: "reopen", visitId, reason: command.reason };
  }
};

const withoutRejection = (state: RecordingState, operationId: RecordingOperationId) => {
  const sync = state.sync;
  const rejection = sync?.rejected.find((item) => item.command.operationId === operationId);
  if (!sync || !rejection) throw new RecordingError("invalid", "That change is already resolved.");
  return {
    rejection,
    state: {
      ...state,
      sync: {
        ...sync,
        rejected: sync.rejected.filter((item) => item !== rejection),
      },
    },
  };
};

/** Gives up on a refused change. Nothing else in the ledger changes. */
export const discardRejected = (state: RecordingState, operationId: RecordingOperationId) =>
  withoutRejection(state, operationId).state;

/** The entries a command creates, in a stable order, so a recorded-again copy can be matched. */
const createdEntries = (command: RecordingCommand) =>
  command.type === "start"
    ? [command.buyInId]
    : command.type === "record_completed"
      ? [command.buyInId, command.cashOutId]
      : command.type === "add" || command.type === "finish"
        ? [command.entryId]
        : command.type === "correct" && command.replacement
          ? [command.replacement.id]
          : [];

/**
 * Records a refused change again as a new command against the ledger as it is now. A refused
 * start brings the refused play that depended on it along, moved to the new visit, so offline
 * rebuys aren't lost. Throws the rule a change still breaks, and keeps every refusal.
 */
export const recordRejectedAgain = (state: RecordingState, operationId: RecordingOperationId) => {
  const { rejection } = withoutRejection(state, operationId);
  const chain =
    rejection.command.type === "start" || rejection.command.type === "record_completed"
      ? state.sync!.rejected.filter(
          (item) => item === rejection || item.command.visitId === rejection.command.visitId,
        )
      : [rejection];
  const ids = new Map<string, string>();
  let next = state;
  for (const item of chain) {
    next = withoutRejection(next, item.command.operationId).state;
    const command = prepareRecordingCommand(next, inputOf(item.command, ids));
    ids.set(item.command.visitId, command.visitId);
    const before = createdEntries(item.command);
    createdEntries(command).forEach((id, index) => ids.set(before[index]!, id));
    next = applyRecordingCommand(next, command);
  }
  return next;
};

export type RecordingSyncStatus = {
  /** `retrying` waits out a failure that more signal or time can fix; `blocked` waits for a person. */
  readonly phase: "idle" | "syncing" | "retrying" | "blocked";
  readonly error: unknown | null;
};

const MAX_DELAY = Duration.minutes(5);

/**
 * Syncs one account's share of the device ledger: pulls once, then pushes whatever is pending,
 * and again whenever something new is saved or `wake` says the network may be back. Failures
 * back off from one second to five minutes; a wake cuts the wait short.
 */
export const makeRecordingSync = (
  store: RecordingStore,
  userId: UserId,
  transport: RecordingTransport,
) => {
  let status: RecordingSyncStatus = { phase: "idle", error: null };
  const listeners = new Set<() => void>();
  const setStatus = (next: RecordingSyncStatus) => {
    status = next;
    for (const listener of listeners) listener();
  };
  let pull = true;
  let signal: ((reason: "wake" | "change") => void) | null = null;

  const transform = (change: (state: RecordingState) => RecordingState) =>
    Effect.tryPromise({ try: () => store.transform(change), catch: (error) => error });

  const round = Effect.gen(function* () {
    setStatus({ phase: "syncing", error: null });
    for (;;) {
      if (pull) {
        const history = yield* transport.history;
        yield* transform((state) => mergeRecordingHistory(state, userId, history));
        pull = false;
      }
      const state = store.getSnapshot().state;
      if (!state) return yield* Effect.fail(new RecordingError("load", "Recording isn't loaded."));
      const commands = pendingRecordingCommands(state).slice(0, BATCH);
      if (commands.length === 0) break;
      const response = yield* transport
        .push({ identity: { playerId: state.self.id, actorId: state.actor.id }, commands })
        .pipe(
          Effect.tapError((error) =>
            Effect.sync(() => {
              // Another device established the account first: adopt it on the next try.
              if (isIdentityConflict(error)) pull = true;
            }),
          ),
        );
      yield* transform((current) => applyPushResults(current, response.results));
      // A refusal can mean another device changed the visit: converge on the server's ledger.
      if (response.results.some((result) => result.status === "rejected")) pull = true;
    }
    setStatus({ phase: "idle", error: null });
  });

  const run = Effect.gen(function* () {
    const wakes = yield* Queue.sliding<"wake" | "change">(1);
    signal = (reason) => Queue.offerUnsafe(wakes, reason);
    const unsubscribe = store.subscribe(() => {
      const state = store.getSnapshot().state;
      if (state?.sync && pendingRecordingCommands(state).length > 0) signal?.("change");
    });
    yield* Effect.addFinalizer(() => Effect.sync(unsubscribe));
    let attempt = 0;
    for (;;) {
      const failure = yield* round.pipe(
        Effect.as(null),
        Effect.catch((error) => Effect.succeed({ error })),
      );
      if (failure === null) {
        attempt = 0;
        if ((yield* Queue.take(wakes)) === "wake") pull = true;
        continue;
      }
      const { error } = failure;
      if (error instanceof RecordingSyncBlocked) {
        setStatus({ phase: "blocked", error });
        yield* Queue.take(wakes);
        pull = true;
        continue;
      }
      setStatus({ phase: "retrying", error });
      const delay = Duration.min(Duration.times(Duration.seconds(1), 2 ** attempt), MAX_DELAY);
      attempt += 1;
      const woke = yield* Effect.raceFirst(Effect.as(Effect.sleep(delay), null), Queue.take(wakes));
      if (woke === "wake") pull = true;
    }
  }).pipe(Effect.scoped, Effect.ensuring(Effect.sync(() => (signal = null))));

  return {
    /** Runs until interrupted. Fork it while this account is signed in. */
    run,
    /** The network or the app came back: pull and push now instead of after the backoff. */
    wake: () => signal?.("wake"),
    getStatus: () => status,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    discard: (operationId: RecordingOperationId) =>
      store.transform((state) => discardRejected(state, operationId)),
    recordAgain: async (operationId: RecordingOperationId) => {
      await store.transform((state) => recordRejectedAgain(state, operationId));
      signal?.("change");
    },
  };
};
export type RecordingSync = ReturnType<typeof makeRecordingSync>;

const isIdentityConflict = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "Conflict" &&
  "reason" in error &&
  error.reason === "recording_identity";
