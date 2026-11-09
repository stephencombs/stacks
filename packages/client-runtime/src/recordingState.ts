import {
  Actor,
  PlayEntry,
  PlayerIdentity,
  Table,
  UserId,
  Visit,
  type EntryId,
} from "@stacks/contracts";
import {
  RecordingCommand,
  RecordingOperationId,
  RecordingRejectionReason,
} from "@stacks/contracts/recordingCommands";
import {
  applyRecordingCommand,
  finalCashOut,
  RecordingError,
  RecordingReceipt,
} from "@stacks/shared/recording";
import { visitSummary } from "@stacks/shared/visits";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";

export { applyRecordingCommand, RecordingError, RecordingReceipt } from "@stacks/shared/recording";

/** A command the server refused, kept out of the ledger until it's recorded again or discarded. */
export const RecordingRejection = Schema.Struct({
  command: RecordingCommand,
  reason: RecordingRejectionReason,
  message: Schema.String,
});
export type RecordingRejection = typeof RecordingRejection.Type;

/** Present once an account has claimed this device's history. Receipts not `synced` are pending. */
const RecordingSync = Schema.Struct({
  userId: UserId,
  synced: Schema.Array(RecordingOperationId),
  rejected: Schema.Array(RecordingRejection),
});

export const RecordingState = Schema.Struct({
  version: Schema.Literal(1),
  self: PlayerIdentity,
  actor: Actor,
  tables: Schema.Array(Table),
  visits: Schema.Array(Visit),
  entries: Schema.Array(PlayEntry),
  receipts: Schema.Array(RecordingReceipt),
  sync: Schema.optionalKey(RecordingSync),
});
export type RecordingState = typeof RecordingState.Type;

const requireValid: (condition: unknown, message: string) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) throw new RecordingError("invalid", message);
};
const ms = DateTime.toEpochMillis;
const unique = (records: ReadonlyArray<{ readonly id: string }>) =>
  new Set(records.map((record) => record.id)).size === records.length;

const validateRecordingState = (state: RecordingState) => {
  requireValid(state.actor.userId === null, "Private recording has a local actor.");
  requireValid(
    unique(state.tables) && unique(state.visits) && unique(state.entries),
    "Duplicate record ID.",
  );
  const tables = new Map(state.tables.map((table) => [table.id, table]));
  const visits = new Map(state.visits.map((visit) => [visit.id, visit]));
  const entries = new Map(state.entries.map((entry) => [entry.id, entry]));
  for (const table of state.tables) {
    requireValid(
      table.tripId === null && table.starterActorId === state.actor.id,
      "Foreign table ownership.",
    );
    requireValid(
      state.visits.some((visit) => visit.tableId === table.id),
      "Table has no visit.",
    );
  }
  for (const visit of state.visits) {
    requireValid(
      tables.has(visit.tableId) && visit.playerId === state.self.id,
      "Foreign visit ownership.",
    );
    const summary = visitSummary(visit, state.entries);
    const result =
      BigInt(summary.totals.cashOut) +
      BigInt(summary.totals.adjustment) -
      BigInt(summary.totals.buyIn);
    requireValid(
      result >= BigInt(Number.MIN_SAFE_INTEGER) && result <= BigInt(Number.MAX_SAFE_INTEGER),
      "Result overflow.",
    );
  }
  for (const entry of state.entries) {
    const visit = visits.get(entry.visitId);
    requireValid(
      visit && entry.createdBy === state.actor.id && entry.counterpartyId === null,
      "Foreign fact ownership.",
    );
    requireValid(
      entry.voidedBy === null || entry.voidedBy === state.actor.id,
      "Foreign void actor.",
    );
    requireValid(
      ms(entry.occurredAt) >= ms(visit.startedAt) &&
        (entry.voidedAt !== null ||
          visit.finishedAt === null ||
          ms(entry.occurredAt) <= ms(visit.finishedAt)),
      "Fact outside visit times.",
    );
  }

  const operations = new Set<string>();
  const createdEntries = new Set<EntryId>();
  const voids = new Set<EntryId>();
  const lifecycle = new Map<Visit["id"], { revision: number; finishedAt: DateTime.Utc | null }>();
  const finals = new Map<Visit["id"], EntryId | null>();
  const createdTables = new Set<Table["id"]>();
  const verifyEntry = (
    command: RecordingCommand,
    id: EntryId,
    kind: PlayEntry["kind"],
    amount: number,
    occurredAt: DateTime.Utc,
    note: string | null = null,
    replacesEntryId: EntryId | null = null,
  ) => {
    const entry = entries.get(id);
    requireValid(entry && !createdEntries.has(id), "Receipt fact is missing or duplicated.");
    requireValid(
      entry.visitId === command.visitId &&
        entry.kind === kind &&
        entry.amount === amount &&
        ms(entry.occurredAt) === ms(occurredAt) &&
        entry.note === note &&
        entry.replacesEntryId === replacesEntryId &&
        ms(entry.createdAt) === ms(command.preparedAt),
      "Fact differs from its command receipt.",
    );
    createdEntries.add(id);
  };
  for (const [index, receipt] of state.receipts.entries()) {
    const command = receipt.command;
    requireValid(
      !operations.has(command.operationId) &&
        receipt.revision === index + 2 &&
        command.actorId === state.actor.id,
      "Invalid command receipt.",
    );
    operations.add(command.operationId);
    const visit = visits.get(command.visitId);
    requireValid(visit, "Receipt references a missing visit.");
    if (command.type === "start" || command.type === "record_completed") {
      const table = tables.get(command.tableId);
      requireValid(
        table && !createdTables.has(table.id) && !lifecycle.has(visit.id),
        "Duplicate or missing start records.",
      );
      requireValid(
        visit.tableId === table.id &&
          ms(visit.startedAt) === ms(command.startedAt) &&
          table.game === command.game &&
          table.venueId === command.venueId &&
          table.highLimit === command.highLimit,
        "Start records differ from the receipt.",
      );
      createdTables.add(table.id);
      verifyEntry(command, command.buyInId, "buy_in", command.buyIn, command.startedAt);
      if (command.type === "record_completed") {
        requireValid(
          ms(command.finishedAt) >= ms(command.startedAt),
          "Completed receipt finishes before start.",
        );
        verifyEntry(command, command.cashOutId, "cash_out", command.cashOut, command.finishedAt);
      }
      lifecycle.set(visit.id, {
        revision: 0,
        finishedAt: command.type === "start" ? null : command.finishedAt,
      });
    } else {
      const previous = lifecycle.get(visit.id);
      requireValid(
        previous && previous.revision === command.expectedRevision,
        "Invalid visit revision history.",
      );
      previous.revision += 1;
      if (command.type === "add" || command.type === "finish") {
        requireValid(previous.finishedAt === null, "Receipt adds play after finish.");
        if (command.type === "add")
          verifyEntry(
            command,
            command.entryId,
            command.kind,
            command.amount,
            command.occurredAt,
            command.note,
          );
        else {
          verifyEntry(command, command.entryId, "cash_out", command.amount, command.finishedAt);
          requireValid(
            ms(command.finishedAt) >= ms(visit.startedAt),
            "Finish receipt precedes start.",
          );
          previous.finishedAt = command.finishedAt;
        }
      } else if (command.type === "reopen") {
        requireValid(previous.finishedAt !== null, "Receipt reopens a live visit.");
        previous.finishedAt = null;
        const final = finals.get(visit.id);
        if (final) {
          const voided = entries.get(final);
          requireValid(
            voided &&
              !voids.has(final) &&
              voided.voidedAt !== null &&
              ms(voided.voidedAt) === ms(command.preparedAt) &&
              voided.voidedBy === command.actorId &&
              voided.voidReason === command.reason,
            reopenNotVoided,
          );
          voids.add(final);
        }
      } else {
        const original = entries.get(command.entryId);
        requireValid(
          original &&
            original.visitId === visit.id &&
            createdEntries.has(original.id) &&
            !voids.has(original.id),
          "Invalid correction history.",
        );
        requireValid(
          original.voidedAt !== null &&
            ms(original.voidedAt) === ms(command.preparedAt) &&
            original.voidReason === command.reason,
          "Void differs from its command receipt.",
        );
        voids.add(original.id);
        if (command.replacement)
          verifyEntry(
            command,
            command.replacement.id,
            original.kind,
            command.replacement.amount,
            command.replacement.occurredAt,
            command.replacement.note,
            original.id,
          );
      }
    }
    finals.set(visit.id, finalCashOut(finals.get(visit.id) ?? null, command));
  }
  requireValid(
    createdEntries.size === entries.size &&
      createdTables.size === tables.size &&
      lifecycle.size === visits.size,
    "Records have missing command receipts.",
  );
  for (const entry of state.entries)
    requireValid(
      (entry.voidedAt !== null) === voids.has(entry.id),
      "Void has no correction receipt.",
    );
  for (const visit of state.visits) {
    const history = lifecycle.get(visit.id);
    requireValid(
      history &&
        history.revision === visit.revision &&
        (history.finishedAt === null
          ? visit.finishedAt === null
          : visit.finishedAt !== null && ms(history.finishedAt) === ms(visit.finishedAt)),
      "Visit differs from its lifecycle receipts.",
    );
  }
  if (state.sync) {
    const synced = new Set(state.sync.synced);
    requireValid(
      synced.size === state.sync.synced.length &&
        state.sync.synced.every((id) => operations.has(id)),
      "Sync marks an unknown command.",
    );
    const rejected = new Set(state.sync.rejected.map((item) => item.command.operationId));
    requireValid(
      rejected.size === state.sync.rejected.length &&
        [...rejected].every((id) => !operations.has(id)) &&
        state.sync.rejected.every((item) => item.command.actorId === state.actor.id),
      "A rejected command is still in the ledger.",
    );
  }
  return state;
};

const codec = Schema.toCodecJson(RecordingState);
export const encodeRecordingState = (state: RecordingState) =>
  JSON.stringify(Schema.encodeSync(codec)(validateRecordingState(state)));
const reopenNotVoided = "Reopen did not void the final cash-out.";
// A document saved before reopen voided the final cash-out holds a reopen receipt whose
// cash-out is still live. Replaying its commands is deterministic: only the voids may differ.
const upgradeLegacyReopen = (state: RecordingState) => {
  const replayed = state.receipts.reduce(
    (current, receipt) => applyRecordingCommand(current, receipt.command),
    { ...state, tables: [], visits: [], entries: [], receipts: [] } as RecordingState,
  );
  const live = (entries: RecordingState["entries"]) =>
    JSON.stringify(
      entries.map((entry) => ({ ...entry, voidedAt: null, voidedBy: null, voidReason: null })),
    );
  requireValid(
    JSON.stringify({ ...replayed, entries: [] }) === JSON.stringify({ ...state, entries: [] }) &&
      live(replayed.entries) === live(state.entries),
    "Recording history differs from its command receipts.",
  );
  return validateRecordingState(replayed);
};
const validateOrUpgrade = (state: RecordingState) => {
  try {
    return validateRecordingState(state);
  } catch (cause) {
    if (!(cause instanceof RecordingError) || cause.message !== reopenNotVoided) throw cause;
    return upgradeLegacyReopen(state);
  }
};
export const decodeRecordingState = (payload: string, revision: number) => {
  try {
    const state = validateOrUpgrade(
      Schema.decodeUnknownSync(codec)(JSON.parse(payload), { onExcessProperty: "error" }),
    );
    // Until an account links it, every commit adds exactly one receipt. Sync then commits
    // bookkeeping, merges and discards that don't.
    requireValid(
      state.sync !== undefined || revision === state.receipts.length + 1,
      "Document and receipt revisions differ.",
    );
    return state;
  } catch (cause) {
    throw new RecordingError(
      "load",
      "Recording history is damaged or uses an unsupported version.",
      cause,
    );
  }
};
