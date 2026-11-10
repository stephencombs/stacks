import {
  ActorId,
  EntryId,
  MinorUnits,
  PlayerId,
  TableId,
  VisitId,
  type Game,
  type VenueId,
} from "@stacks/contracts";
import { RecordingCommand, RecordingOperationId } from "@stacks/contracts/recordingCommands";
import { pairRevision } from "@stacks/shared/recording";
import { projectVisit } from "@stacks/shared/visits";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";

import { newId } from "./ids.ts";
import {
  applyRecordingCommand,
  decodeRecordingState,
  encodeRecordingState,
  RecordingError,
  type RecordingReceipt,
  type RecordingState,
} from "./recordingState.ts";
import { RecordingStorageConflict, type RecordingStorage } from "./recordingStorage.ts";

export { RecordingError } from "./recordingState.ts";
export type { RecordingReceipt, RecordingState } from "./recordingState.ts";

type StartInput = {
  readonly buyIn: number;
  readonly startedAt?: DateTime.Utc;
  readonly game?: Game;
  readonly venueId?: VenueId;
  readonly highLimit?: boolean;
};
export type RecordingInput =
  | ({ readonly type: "start" } & StartInput)
  | ({
      readonly type: "record_completed";
      readonly cashOut: number;
      readonly startedAt: DateTime.Utc;
      readonly finishedAt: DateTime.Utc;
    } & StartInput)
  | {
      /** A saved player by `playerId`, or a new one by `displayName`. */
      readonly type: "join_table";
      readonly tableId: TableId;
      readonly playerId?: PlayerId;
      readonly displayName?: string;
      readonly buyIn: number;
      readonly startedAt?: DateTime.Utc;
      readonly counterpartyId?: PlayerId;
    }
  | {
      readonly type: "add";
      readonly visitId: VisitId;
      readonly kind: "buy_in" | "cash_out";
      readonly amount: number;
      readonly occurredAt?: DateTime.Utc;
      readonly note?: string;
      readonly counterpartyId?: PlayerId;
    }
  | {
      readonly type: "finish";
      readonly visitId: VisitId;
      readonly amount: number;
      readonly finishedAt?: DateTime.Utc;
      readonly counterpartyId?: PlayerId;
    }
  | {
      readonly type: "correct";
      readonly visitId: VisitId;
      readonly entryId: EntryId;
      readonly reason: string;
      readonly replacement: {
        readonly amount: number;
        readonly occurredAt?: DateTime.Utc;
        readonly note?: string;
        readonly counterpartyId?: PlayerId;
      } | null;
    }
  | { readonly type: "reopen"; readonly visitId: VisitId; readonly reason: string }
  | { readonly type: "appoint_recorder"; readonly tableId: TableId; readonly playerId: PlayerId }
  | { readonly type: "revoke_recorder"; readonly tableId: TableId; readonly playerId: PlayerId }
  | ({
      readonly type: "repay";
      readonly fromPlayerId: PlayerId;
      readonly toPlayerId: PlayerId;
    } & PaymentInput)
  | ({
      readonly type: "correct_repayment";
      readonly repaymentId: EntryId;
      readonly reason: string;
    } & PaymentInput)
  | { readonly type: "void_repayment"; readonly repaymentId: EntryId; readonly reason: string };

type PaymentInput = {
  readonly amount: number;
  readonly occurredAt?: DateTime.Utc;
  readonly note?: string;
};

const withCounterparty = (counterpartyId: PlayerId | undefined) =>
  counterpartyId === undefined ? {} : { counterpartyId };

export type RecordingSnapshot = {
  readonly state: RecordingState | null;
  readonly revision: number;
  readonly publication: "private";
  readonly status: "loading" | "saved" | "saving" | "save_failed" | "load_failed" | "closed";
  readonly error: unknown | null;
  readonly failedCommand: RecordingCommand | null;
};

const commandCodec = Schema.toCodecJson(RecordingCommand);
const commandText = (command: RecordingCommand) =>
  JSON.stringify(Schema.encodeSync(commandCodec)(command));

export const prepareRecordingCommand = (
  state: RecordingState,
  input: RecordingInput,
): RecordingCommand => {
  const preparedAt = DateTime.makeUnsafe(Date.now());
  const common = {
    operationId: RecordingOperationId.make(newId()),
    actorId: state.actor.id,
    preparedAt,
  };
  if (input.type === "start" || input.type === "record_completed") {
    const start = {
      ...common,
      tableId: TableId.make(newId()),
      visitId: VisitId.make(newId()),
      buyInId: EntryId.make(newId()),
      playerId: state.self.id,
      buyIn: MinorUnits.make(input.buyIn),
      startedAt: input.startedAt ?? preparedAt,
      game: input.game ?? null,
      venueId: input.venueId ?? null,
      highLimit: input.highLimit ?? false,
    };
    return RecordingCommand.make(
      input.type === "start"
        ? { type: "start", ...start }
        : {
            type: "record_completed",
            ...start,
            cashOutId: EntryId.make(newId()),
            cashOut: MinorUnits.make(input.cashOut),
            finishedAt: input.finishedAt,
          },
    );
  }
  if (input.type === "join_table") {
    const saved = state.players.some((player) => player.id === input.playerId);
    const displayName = input.displayName?.trim() ?? "";
    if (!saved && displayName === "")
      throw new RecordingError("invalid", "Enter the player's name.");
    if (!saved && displayName.length > 60)
      throw new RecordingError("invalid", "Keep the name to 60 characters.");
    const playerId = input.playerId ?? PlayerId.make(newId());
    return RecordingCommand.make({
      ...common,
      type: "join_table",
      tableId: input.tableId,
      visitId: VisitId.make(newId()),
      playerId,
      buyInId: EntryId.make(newId()),
      buyIn: MinorUnits.make(input.buyIn),
      startedAt: input.startedAt ?? preparedAt,
      ...(saved ? {} : { newPlayer: { id: playerId, displayName } }),
      ...withCounterparty(input.counterpartyId),
    });
  }
  if (input.type === "repay") {
    const pair =
      input.fromPlayerId < input.toPlayerId
        ? ([input.fromPlayerId, input.toPlayerId] as const)
        : ([input.toPlayerId, input.fromPlayerId] as const);
    return RecordingCommand.make({
      ...common,
      type: "repay",
      expectedRevision: pairRevision(state, pair),
      repaymentId: EntryId.make(newId()),
      fromPlayerId: input.fromPlayerId,
      toPlayerId: input.toPlayerId,
      amount: MinorUnits.make(input.amount),
      occurredAt: input.occurredAt ?? preparedAt,
      note: input.note?.trim() || null,
    });
  }
  if (input.type === "correct_repayment" || input.type === "void_repayment") {
    const original = state.repayments.find((repayment) => repayment.id === input.repaymentId);
    if (!original) throw new RecordingError("invalid", "Payment does not exist.");
    const { fromPlayerId: a, toPlayerId: b } = original;
    const paired = { ...common, expectedRevision: pairRevision(state, a < b ? [a, b] : [b, a]) };
    return input.type === "void_repayment"
      ? RecordingCommand.make({
          ...paired,
          type: "void_repayment",
          repaymentId: original.id,
          reason: input.reason,
        })
      : RecordingCommand.make({
          ...paired,
          type: "correct_repayment",
          repaymentId: original.id,
          reason: input.reason,
          replacement: {
            id: EntryId.make(newId()),
            amount: MinorUnits.make(input.amount),
            occurredAt: input.occurredAt ?? original.occurredAt,
            note: input.note === undefined ? original.note : input.note.trim() || null,
          },
        });
  }
  if (input.type === "appoint_recorder" || input.type === "revoke_recorder")
    return RecordingCommand.make({
      ...common,
      type: input.type,
      tableId: input.tableId,
      playerId: input.playerId,
    });
  const visit = state.visits.find((visit) => visit.id === input.visitId);
  if (!visit) throw new RecordingError("invalid", "Visit does not exist.");
  const existing = { ...common, visitId: visit.id, expectedRevision: visit.revision };
  switch (input.type) {
    case "add":
      return RecordingCommand.make({
        ...existing,
        type: "add",
        entryId: EntryId.make(newId()),
        kind: input.kind,
        amount: MinorUnits.make(input.amount),
        occurredAt: input.occurredAt ?? preparedAt,
        note: input.note ?? null,
        ...withCounterparty(input.counterpartyId),
      });
    case "finish":
      return RecordingCommand.make({
        ...existing,
        type: "finish",
        entryId: EntryId.make(newId()),
        amount: MinorUnits.make(input.amount),
        finishedAt: input.finishedAt ?? preparedAt,
        ...withCounterparty(input.counterpartyId),
      });
    case "correct": {
      const original = state.entries.find(
        (entry) => entry.id === input.entryId && entry.visitId === visit.id,
      );
      if (!original) throw new RecordingError("invalid", "Correction target does not exist.");
      return RecordingCommand.make({
        ...existing,
        type: "correct",
        entryId: input.entryId,
        reason: input.reason,
        replacement:
          input.replacement === null
            ? null
            : {
                id: EntryId.make(newId()),
                amount: MinorUnits.make(input.replacement.amount),
                occurredAt: input.replacement.occurredAt ?? original.occurredAt,
                note: input.replacement.note ?? original.note,
                ...withCounterparty(input.replacement.counterpartyId),
              },
      });
    }
    case "reopen":
      return RecordingCommand.make({ ...existing, type: "reopen", reason: input.reason });
  }
};

const freezeState = (state: RecordingState): RecordingState => {
  for (const records of [
    state.players,
    state.participants,
    state.recorders,
    state.tables,
    state.visits,
    state.entries,
    state.repayments,
    state.receipts,
  ]) {
    for (const record of records) Object.freeze(record);
    Object.freeze(records);
  }
  for (const receipt of state.receipts) {
    if (
      (receipt.command.type === "correct" || receipt.command.type === "correct_repayment") &&
      receipt.command.replacement
    )
      Object.freeze(receipt.command.replacement);
    if (receipt.command.type === "join_table" && receipt.command.newPlayer)
      Object.freeze(receipt.command.newPlayer);
    Object.freeze(receipt.command);
  }
  Object.freeze(state.self);
  Object.freeze(state.actor);
  return Object.freeze(state);
};

/** Owns the supplied adapter; close the store to release it. No auth or transport is involved. */
export const makeRecordingStore = (storage: RecordingStorage) => {
  let snapshot: RecordingSnapshot = Object.freeze({
    state: null,
    revision: 0,
    publication: "private",
    status: "loading",
    error: null,
    failedCommand: null,
  });
  let closed = false;
  let loadFailed = false;
  let closePromise: Promise<void> | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();
  const update = (values: Partial<RecordingSnapshot>) => {
    snapshot = Object.freeze({ ...snapshot, ...values });
    for (const listener of listeners) {
      // Subscribers cannot change the outcome of an acknowledged durable transaction.
      try {
        listener();
      } catch {
        /* A view owns its subscriber errors. */
      }
    }
  };
  const serialize = <A>(operation: () => Promise<A>): Promise<A> => {
    if (closed) return Promise.reject(new RecordingError("closed", "Recording store is closed."));
    const result = queue.then(operation);
    queue = result.catch(() => undefined);
    return result;
  };
  const load = async () => {
    const document = await storage.load();
    if (document.payload === undefined) {
      if (snapshot.state !== null)
        throw new RecordingError("load", "Saved recording history disappeared.");
      const self = { id: PlayerId.make(newId()), displayName: "You" };
      const state: RecordingState = {
        version: 2,
        self,
        actor: { id: ActorId.make(newId()), userId: null },
        players: [self],
        participants: [],
        recorders: [],
        tables: [],
        visits: [],
        entries: [],
        repayments: [],
        receipts: [],
      };
      try {
        const revision = await storage.commit(0, encodeRecordingState(state));
        update({
          state: freezeState(state),
          revision,
          status: loadFailed ? "load_failed" : "saved",
          error: loadFailed ? snapshot.error : null,
        });
      } catch (error) {
        if (!(error instanceof RecordingStorageConflict)) throw error;
        const winner = await storage.load();
        if (winner.payload === undefined) throw error;
        update({
          state: freezeState(decodeRecordingState(winner.payload, winner.revision)),
          revision: winner.revision,
          status: loadFailed ? "load_failed" : "saved",
          error: loadFailed ? snapshot.error : null,
        });
      }
    } else {
      const state = freezeState(decodeRecordingState(document.payload, document.revision));
      const previous = snapshot.state;
      // Another screen may have adopted the account's identity before anything synced.
      const adopted = state.sync !== undefined && (previous?.sync?.synced.length ?? 0) === 0;
      if (
        previous &&
        (((state.self.id !== previous.self.id || state.actor.id !== previous.actor.id) &&
          !adopted) ||
          document.revision < snapshot.revision)
      )
        throw new RecordingError("load", "Recording identity or revision changed unexpectedly.");
      update({
        state,
        revision: document.revision,
        status: loadFailed ? "load_failed" : "saved",
        error: loadFailed ? snapshot.error : null,
      });
    }
  };
  const refresh = () =>
    serialize(async () => {
      try {
        loadFailed = false;
        await load();
      } catch (error) {
        loadFailed = true;
        update({ status: "load_failed", error });
        throw error;
      }
    });
  const unsubscribe = storage.subscribe((change) => {
    if (closed) return;
    if (change.type === "error") {
      loadFailed = true;
      update({ status: "load_failed", error: change.error });
    } else if (change.revision > snapshot.revision) void refresh().catch(() => undefined);
  });
  const ready = refresh();
  const execute = (prepared: RecordingCommand) => {
    // Copy/validate now, so a caller cannot mutate queued or failed work.
    const command = Schema.decodeUnknownSync(commandCodec)(JSON.parse(commandText(prepared)), {
      onExcessProperty: "error",
    });
    Object.freeze(command);
    if (command.type === "correct" && command.replacement) Object.freeze(command.replacement);
    return serialize(async (): Promise<RecordingReceipt> => {
      try {
        const state = snapshot.state;
        if (state === null || loadFailed)
          throw new RecordingError("load", "Load recording history before saving.");
        const receipt = state.receipts.find(
          (receipt) => receipt.command.operationId === command.operationId,
        );
        if (receipt) {
          if (commandText(receipt.command) !== commandText(command))
            throw new RecordingError(
              "operation_reused",
              "This operation ID was already saved with different content.",
            );
          update({ status: "saved", error: null, failedCommand: null });
          return receipt;
        }
        const committed = applyRecordingCommand(state, command);
        const saved = committed.receipts[committed.receipts.length - 1]!;
        const payload = encodeRecordingState(committed);
        update({ status: "saving", error: null, failedCommand: null });
        const revision = await storage.commit(snapshot.revision, payload);
        update({
          state: freezeState(committed),
          revision,
          status: loadFailed ? "load_failed" : "saved",
          error: loadFailed ? snapshot.error : null,
          failedCommand: null,
        });
        return saved;
      } catch (error) {
        update({
          status: loadFailed ? "load_failed" : "save_failed",
          error,
          failedCommand: command,
        });
        throw error;
      }
    });
  };
  return {
    ready,
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    prepare: (input: RecordingInput) => {
      if (closed) throw new RecordingError("closed", "Recording store is closed.");
      if (snapshot.state === null || loadFailed)
        throw new RecordingError("load", "Load recording history before preparing a command.");
      return prepareRecordingCommand(snapshot.state, input);
    },
    execute,
    retry: () => {
      if (!snapshot.failedCommand)
        return Promise.reject(
          new RecordingError("invalid", "There is no failed command to retry."),
        );
      return execute(snapshot.failedCommand);
    },
    refresh,
    /**
     * Saves a whole-ledger change, such as sync bookkeeping, in turn with commands. `change` sees
     * the latest saved state; returning it unchanged saves nothing.
     */
    transform: (change: (state: RecordingState) => RecordingState) =>
      serialize(async () => {
        const state = snapshot.state;
        if (state === null || loadFailed)
          throw new RecordingError("load", "Load recording history before saving.");
        const next = change(state);
        const payload = encodeRecordingState(next);
        if (next === state || payload === encodeRecordingState(state)) return state;
        const revision = await storage.commit(snapshot.revision, payload);
        update({ state: freezeState(next), revision });
        return next;
      }),
    review: (visitId: VisitId) => {
      const state = snapshot.state;
      const visit = state?.visits.find((visit) => visit.id === visitId);
      if (!state || !visit) throw new RecordingError("invalid", "Visit does not exist.");
      return projectVisit(visit, state.entries);
    },
    close: () =>
      (closePromise ??= (() => {
        closed = true;
        unsubscribe();
        return queue.then(async () => {
          try {
            await storage.close();
          } finally {
            update({ status: "closed" });
            listeners.clear();
          }
        });
      })()),
  };
};
export type RecordingStore = ReturnType<typeof makeRecordingStore>;
