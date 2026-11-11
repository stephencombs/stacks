import {
  Actor,
  PlayEntry,
  PlayerId,
  PlayerIdentity,
  Repayment,
  Table,
  TableId,
  UserId,
  Visit,
  type EntryId,
} from "@stacks/contracts";
import {
  isPairCommand,
  isTableCommand,
  RecordingCommand,
  RecordingOperationId,
  RecordingRejectionReason,
  type PairCommand,
  type VisitCommand,
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

/**
 * Applies a receipt as it was recorded: this device's own commands under its rules, and another
 * actor's, which only ever come from the server, as the server accepted them.
 */
const applyReceipt = <S extends RecordingState>(state: S, command: RecordingCommand) =>
  applyRecordingCommand(state, command, command.actorId === state.actor.id ? undefined : null);

/** A command the server refused, kept out of the ledger until it's recorded again or discarded. */
export const RecordingRejection = Schema.Struct({
  command: RecordingCommand,
  reason: RecordingRejectionReason,
  message: Schema.String,
});
export type RecordingRejection = typeof RecordingRejection.Type;

/**
 * Present once this device's history syncs: to an account, or, signed out, as the device's own
 * actor (`userId` null). Receipts not `synced` are pending.
 */
const RecordingSync = Schema.Struct({
  userId: Schema.NullOr(UserId),
  synced: Schema.Array(RecordingOperationId),
  rejected: Schema.Array(RecordingRejection),
});

const AtTable = Schema.Struct({ tableId: TableId, playerId: PlayerId });

export const RecordingState = Schema.Struct({
  version: Schema.Literal(2),
  self: PlayerIdentity,
  actor: Actor,
  /**
   * Everyone whose play this device holds: `self`, the players it added at its tables, the
   * `participants` (who joined its tables, and who it is at others'), and anyone else at the
   * tables it records for.
   */
  players: Schema.Array(PlayerIdentity),
  participants: Schema.Array(AtTable),
  /** Who records for everyone at a table, as the starter's appointments left it. */
  recorders: Schema.Array(AtTable),
  /** The tables it started, and the ones it is at. */
  tables: Schema.Array(Table),
  visits: Schema.Array(Visit),
  entries: Schema.Array(PlayEntry),
  /** Payments between its players and others, as their commands left them. */
  repayments: Schema.Array(Repayment),
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

const added = (command: RecordingCommand) =>
  command.type === "join_table" ? command.newPlayer?.id : undefined;

/**
 * The ledger before any command: the device's own player, who is at which tables, and the tables
 * others started. Commands rebuild everything else, including the players they added.
 */
export const recordingBase = (state: RecordingState): RecordingState => {
  const joined = new Set(state.participants.map((item) => item.playerId));
  const created = new Set(state.receipts.map((receipt) => added(receipt.command)));
  return {
    ...state,
    players: state.players.filter(
      (player) => player.id === state.self.id || joined.has(player.id) || !created.has(player.id),
    ),
    recorders: [],
    tables: state.tables.filter((table) => table.starterPlayerId !== state.self.id),
    visits: [],
    entries: [],
    repayments: [],
    receipts: [],
  };
};

const validateRecordingState = (state: RecordingState) => {
  requireValid(state.actor.userId === null, "Private recording has a local actor.");
  requireValid(
    unique(state.players) &&
      unique(state.tables) &&
      unique(state.visits) &&
      unique(state.entries) &&
      unique(state.repayments),
    "Duplicate record ID.",
  );
  const players = new Map(state.players.map((player) => [player.id, player]));
  requireValid(
    players.get(state.self.id)?.displayName === state.self.displayName,
    "The device's own player is missing.",
  );
  const tables = new Map(state.tables.map((table) => [table.id, table]));
  const visits = new Map(state.visits.map((visit) => [visit.id, visit]));
  const entries = new Map(state.entries.map((entry) => [entry.id, entry]));
  const participants = new Set(state.participants.map((item) => item.playerId));
  requireValid(
    new Set(state.participants.map((item) => `${item.tableId}:${item.playerId}`)).size ===
      state.participants.length &&
      !participants.has(state.self.id) &&
      state.participants.every((item) => tables.has(item.tableId) && players.has(item.playerId)),
    "Invalid table participant.",
  );
  // A table someone else started is here because this device joined it.
  const joined = new Set<Table["id"]>();
  for (const table of state.tables) {
    requireValid(table.tripId === null, "Foreign table ownership.");
    if (table.starterPlayerId === state.self.id)
      requireValid(
        state.visits.some((visit) => visit.tableId === table.id),
        "Table has no visit.",
      );
    else {
      requireValid(
        state.participants.some((item) => item.tableId === table.id),
        "Foreign table ownership.",
      );
      joined.add(table.id);
    }
  }
  const synced = new Set(state.sync?.synced);
  for (const visit of state.visits) {
    requireValid(
      tables.has(visit.tableId) && players.has(visit.playerId),
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
    requireValid(visit && entry.counterpartyId !== visit.playerId, "Foreign fact ownership.");
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
  const createdPlayers = new Set<PlayerIdentity["id"]>();
  const recorders = new Set<string>();
  const verifyEntry = (
    command: VisitCommand,
    id: EntryId,
    kind: PlayEntry["kind"],
    amount: number,
    occurredAt: DateTime.Utc,
    note: string | null = null,
    replacesEntryId: EntryId | null = null,
    counterpartyId: PlayerId | null = null,
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
        entry.counterpartyId === counterpartyId &&
        entry.createdBy === command.actorId &&
        ms(entry.createdAt) === ms(command.preparedAt),
      "Fact differs from its command receipt.",
    );
    createdEntries.add(id);
  };
  const repayments = new Map(state.repayments.map((repayment) => [repayment.id, repayment]));
  const createdRepayments = new Set<EntryId>();
  const repaymentVoids = new Set<EntryId>();
  const verifyRepayment = (
    command: PairCommand,
    id: EntryId,
    ends: Pick<Repayment, "fromPlayerId" | "toPlayerId">,
    details: Pick<Repayment, "amount" | "occurredAt" | "note">,
    replacesEntryId: EntryId | null,
  ) => {
    const repayment = repayments.get(id);
    requireValid(
      repayment && !createdRepayments.has(id),
      "Receipt payment is missing or duplicated.",
    );
    requireValid(
      repayment.fromPlayerId === ends.fromPlayerId &&
        repayment.toPlayerId === ends.toPlayerId &&
        repayment.amount === details.amount &&
        ms(repayment.occurredAt) === ms(details.occurredAt) &&
        repayment.note === details.note &&
        repayment.replacesEntryId === replacesEntryId &&
        repayment.recordedFromTripId === null &&
        repayment.createdBy === command.actorId &&
        ms(repayment.createdAt) === ms(command.preparedAt),
      "Payment differs from its command receipt.",
    );
    createdRepayments.add(id);
  };
  for (const [index, receipt] of state.receipts.entries()) {
    const command = receipt.command;
    // Another actor's command (the starter's, or a joiner's) comes only from the server.
    requireValid(
      !operations.has(command.operationId) &&
        receipt.revision === index + 2 &&
        (command.actorId === state.actor.id || synced.has(command.operationId)),
      "Invalid command receipt.",
    );
    operations.add(command.operationId);
    if (isPairCommand(command)) {
      if (command.type === "repay") {
        verifyRepayment(command, command.repaymentId, command, command, null);
        continue;
      }
      const original = repayments.get(command.repaymentId);
      requireValid(
        original &&
          createdRepayments.has(original.id) &&
          !repaymentVoids.has(original.id) &&
          original.voidedAt !== null &&
          ms(original.voidedAt) === ms(command.preparedAt) &&
          original.voidedBy === command.actorId &&
          original.voidReason === command.reason,
        "Invalid payment correction history.",
      );
      repaymentVoids.add(original.id);
      if (command.type === "correct_repayment")
        verifyRepayment(
          command,
          command.replacement.id,
          original,
          command.replacement,
          original.id,
        );
      continue;
    }
    if (isTableCommand(command)) {
      const key = `${command.tableId}:${command.playerId}`;
      requireValid(
        tables.has(command.tableId) &&
          (command.type === "appoint_recorder" ? !recorders.has(key) : recorders.has(key)),
        "Invalid recorder history.",
      );
      if (command.type === "appoint_recorder") recorders.add(key);
      else recorders.delete(key);
      continue;
    }
    const visit = visits.get(command.visitId);
    requireValid(visit, "Receipt references a missing visit.");
    if (command.type === "join_table") {
      const table = tables.get(command.tableId);
      requireValid(
        table && (createdTables.has(table.id) || joined.has(table.id)) && !lifecycle.has(visit.id),
        "Duplicate or missing join records.",
      );
      if (command.newPlayer) {
        requireValid(
          command.newPlayer.id === command.playerId &&
            !createdPlayers.has(command.playerId) &&
            players.get(command.playerId)?.displayName === command.newPlayer.displayName,
          "Player differs from the receipt that added them.",
        );
        createdPlayers.add(command.playerId);
      }
      requireValid(
        visit.tableId === table.id &&
          visit.playerId === command.playerId &&
          ms(visit.startedAt) === ms(command.startedAt),
        "Join records differ from the receipt.",
      );
      verifyEntry(
        command,
        command.buyInId,
        "buy_in",
        command.buyIn,
        command.startedAt,
        null,
        null,
        command.counterpartyId ?? null,
      );
      lifecycle.set(visit.id, { revision: 0, finishedAt: null });
    } else if (command.type === "start" || command.type === "record_completed") {
      const table = tables.get(command.tableId);
      requireValid(
        table && !createdTables.has(table.id) && !lifecycle.has(visit.id),
        "Duplicate or missing start records.",
      );
      requireValid(
        visit.tableId === table.id &&
          visit.playerId === command.playerId &&
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
            null,
            command.counterpartyId ?? null,
          );
        else {
          verifyEntry(
            command,
            command.entryId,
            "cash_out",
            command.amount,
            command.finishedAt,
            null,
            null,
            command.counterpartyId ?? null,
          );
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
            original.voidedBy === command.actorId &&
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
            command.replacement.counterpartyId ?? null,
          );
      }
    }
    finals.set(visit.id, finalCashOut(finals.get(visit.id) ?? null, command));
  }
  requireValid(
    createdEntries.size === entries.size &&
      new Set([...createdTables, ...joined]).size === tables.size &&
      lifecycle.size === visits.size,
    "Records have missing command receipts.",
  );
  for (const entry of state.entries)
    requireValid(
      (entry.voidedAt !== null) === voids.has(entry.id),
      "Void has no correction receipt.",
    );
  requireValid(
    createdRepayments.size === repayments.size &&
      state.repayments.every(
        (repayment) => (repayment.voidedAt !== null) === repaymentVoids.has(repayment.id),
      ),
    "Payments differ from their receipts.",
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
  requireValid(
    recorders.size === state.recorders.length &&
      state.recorders.every((item) => recorders.has(`${item.tableId}:${item.playerId}`)),
    "Recorders differ from their receipts.",
  );
  if (state.sync) {
    requireValid(
      synced.size === state.sync.synced.length &&
        state.sync.synced.every((id) => operations.has(id)),
      "Sync marks an unknown command.",
    );
    const rejected = new Set(state.sync.rejected.map((item) => item.command.operationId));
    requireValid(
      rejected.size === state.sync.rejected.length &&
        // A reused operation ID refers to the account's different command, which may be here
        // once synced; never as a pending command that would be pushed again.
        state.sync.rejected.every(
          (item) =>
            !operations.has(item.command.operationId) ||
            (item.reason === "operation_reused" && synced.has(item.command.operationId)),
        ) &&
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
    (current, receipt) => applyReceipt(current, receipt.command),
    recordingBase(state),
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
type Command = { readonly type: string };
type VersionOne = {
  readonly version: 1;
  readonly self: { readonly id: string };
  readonly tables: ReadonlyArray<{ readonly starterActorId: string }>;
  readonly receipts: ReadonlyArray<{ readonly command: Command }>;
  readonly sync?: { readonly rejected: ReadonlyArray<{ readonly command: Command }> };
};
// Documents from before joining had no participants, from before appointing no recorders, and
// from before payments no repayments.
const withParticipants = (document: unknown) =>
  typeof document === "object" && document !== null
    ? { participants: [], recorders: [], repayments: [], ...document }
    : document;

// Version 1 held one player, so its tables and starts were all its own.
const fromVersionOne = (document: unknown) => {
  if ((document as { version?: unknown } | null)?.version !== 1) return document;
  const v1 = document as VersionOne;
  const named = (command: Command) =>
    command.type === "start" || command.type === "record_completed"
      ? { ...command, playerId: v1.self.id }
      : command;
  return {
    ...v1,
    version: 2,
    players: [v1.self],
    tables: v1.tables.map(({ starterActorId: _, ...table }) => ({
      ...table,
      starterPlayerId: v1.self.id,
    })),
    receipts: v1.receipts.map((receipt) => ({ ...receipt, command: named(receipt.command) })),
    ...(v1.sync && {
      sync: {
        ...v1.sync,
        rejected: v1.sync.rejected.map((item) => ({ ...item, command: named(item.command) })),
      },
    }),
  };
};

export const decodeRecordingState = (payload: string, revision: number) => {
  try {
    const state = validateOrUpgrade(
      Schema.decodeUnknownSync(codec)(withParticipants(fromVersionOne(JSON.parse(payload))), {
        onExcessProperty: "error",
      }),
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
