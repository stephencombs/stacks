import {
  Actor,
  PlayEntry,
  PlayerIdentity,
  Table,
  Visit,
  type EntryId,
  type PlayerId,
} from "@stacks/contracts";
import { RecordingCommand } from "@stacks/contracts/recordingCommands";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";

export const RecordingReceipt = Schema.Struct({
  command: RecordingCommand,
  revision: Schema.Int.check(Schema.isGreaterThan(1)),
});
export type RecordingReceipt = typeof RecordingReceipt.Type;

/**
 * The tables one actor records at, as it applies commands to them, on a device or on the server.
 * `players` are the ones it may start visits for: `self` and the players it added.
 */
export interface RecordingLedger {
  readonly self: PlayerIdentity;
  readonly actor: Actor;
  readonly players: ReadonlyArray<PlayerIdentity>;
  readonly tables: ReadonlyArray<Table>;
  readonly visits: ReadonlyArray<Visit>;
  readonly entries: ReadonlyArray<PlayEntry>;
  readonly receipts: ReadonlyArray<RecordingReceipt>;
}

type RecordingErrorReason =
  | "invalid"
  | "conflict"
  | "operation_reused"
  | "forbidden"
  | "load"
  | "closed";

/**
 * Whether an actor holding `actorPlayers` may write at a table. For now only the table's starter
 * records, for everyone at it.
 */
export const authorize = (
  table: Pick<Table, "starterPlayerId">,
  actorPlayers: ReadonlyArray<PlayerId>,
) => actorPlayers.includes(table.starterPlayerId);

export class RecordingError extends Error {
  override readonly name = "RecordingError";
  readonly reason: RecordingErrorReason;
  constructor(reason: RecordingErrorReason, message: string, cause?: unknown) {
    super(message, { cause });
    this.reason = reason;
  }
}

const requireValid: (condition: unknown, message: string) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) throw new RecordingError("invalid", message);
};
const ms = DateTime.toEpochMillis;
// The live cash-out that last finished the visit, following corrections to its replacement.
export const finalCashOut = (current: EntryId | null, command: RecordingCommand) => {
  switch (command.type) {
    case "record_completed":
      return command.cashOutId;
    case "finish":
      return command.entryId;
    case "correct":
      return command.entryId === current ? (command.replacement?.id ?? null) : current;
    case "reopen":
      return null;
    default:
      return current;
  }
};
/** The entries a command creates, in a stable order. */
export const createdEntryIds = (command: RecordingCommand): ReadonlyArray<EntryId> =>
  command.type === "start" || command.type === "join_table"
    ? [command.buyInId]
    : command.type === "record_completed"
      ? [command.buyInId, command.cashOutId]
      : command.type === "add" || command.type === "finish"
        ? [command.entryId]
        : command.type === "correct" && command.replacement
          ? [command.replacement.id]
          : [];

/**
 * Applies one command. `actorPlayers` are the players bound to the command's actor: on a device,
 * its own player; on the server, what the database binds to the authenticated actor.
 */
export const applyRecordingCommand = <S extends RecordingLedger>(
  state: S,
  command: RecordingCommand,
  actorPlayers: ReadonlyArray<PlayerId> = [state.self.id],
): S => {
  requireValid(command.actorId === state.actor.id, "Command has a foreign local actor.");
  const forbid = (table: Pick<Table, "starterPlayerId">) => {
    if (!authorize(table, actorPlayers))
      throw new RecordingError("forbidden", "Only the player who started this table records here.");
  };
  const tables = [...state.tables];
  const players = [...state.players];
  let visits = [...state.visits];
  let entries = [...state.entries];
  const append = (
    id: EntryId,
    visitId: Visit["id"],
    kind: PlayEntry["kind"],
    amount: PlayEntry["amount"],
    occurredAt: DateTime.Utc,
    note: string | null = null,
    replacesEntryId: EntryId | null = null,
  ) => {
    requireValid(!entries.some((entry) => entry.id === id), "Entry ID is already used.");
    requireValid(
      kind === "buy_in" ? amount > 0 : kind === "cash_out" ? amount >= 0 : amount !== 0,
      kind === "buy_in"
        ? "A buy-in must be more than zero."
        : kind === "cash_out"
          ? "A cash-out can't be negative."
          : "An adjustment can't be zero.",
    );
    entries.push(
      PlayEntry.make({
        id,
        visitId,
        kind,
        amount,
        occurredAt,
        note,
        replacesEntryId,
        currency: "USD",
        counterpartyId: null,
        createdBy: command.actorId,
        createdAt: command.preparedAt,
        voidedAt: null,
        voidedBy: null,
        voidReason: null,
      }),
    );
  };
  const openAt = (tableId: Table["id"], playerId: PlayerId) =>
    visits.some(
      (visit) =>
        visit.tableId === tableId && visit.playerId === playerId && visit.finishedAt === null,
    );
  if (
    command.type === "start" ||
    command.type === "record_completed" ||
    command.type === "join_table"
  ) {
    if (command.type === "join_table") {
      const table = tables.find((table) => table.id === command.tableId);
      requireValid(table, "Table does not exist.");
      forbid(table);
      if (command.newPlayer) {
        requireValid(
          command.newPlayer.id === command.playerId &&
            !players.some((player) => player.id === command.playerId),
          "Player ID is already used.",
        );
        players.push(PlayerIdentity.make(command.newPlayer));
      }
      requireValid(
        players.some((player) => player.id === command.playerId),
        "Add the player before recording their play.",
      );
      requireValid(
        !visits.some((visit) => visit.id === command.visitId),
        "Start IDs are already used.",
      );
      requireValid(
        !openAt(table.id, command.playerId),
        "This player is already playing at this table.",
      );
    } else {
      forbid({ starterPlayerId: command.playerId });
      requireValid(
        !visits.some((visit) => visit.id === command.visitId) &&
          !tables.some((table) => table.id === command.tableId),
        "Start IDs are already used.",
      );
      tables.push(
        Table.make({
          id: command.tableId,
          tripId: null,
          game: command.game,
          venueId: command.venueId,
          highLimit: command.highLimit,
          starterPlayerId: command.playerId,
        }),
      );
    }
    visits.push(
      Visit.make({
        id: command.visitId,
        tableId: command.tableId,
        playerId: command.playerId,
        startedAt: command.startedAt,
        finishedAt: command.type === "record_completed" ? command.finishedAt : null,
        revision: 0,
      }),
    );
    append(command.buyInId, command.visitId, "buy_in", command.buyIn, command.startedAt);
    if (command.type === "record_completed")
      append(command.cashOutId, command.visitId, "cash_out", command.cashOut, command.finishedAt);
  } else {
    const visit = visits.find((visit) => visit.id === command.visitId);
    requireValid(visit, "Visit does not exist.");
    const table = tables.find((table) => table.id === visit.tableId);
    requireValid(table, "Table does not exist.");
    forbid(table);
    if (visit.revision !== command.expectedRevision)
      throw new RecordingError(
        "conflict",
        "Visit changed. Review it before preparing another command.",
      );
    requireValid(visit.revision < Number.MAX_SAFE_INTEGER, "Visit revision overflow.");
    let finishedAt = visit.finishedAt;
    if (command.type === "add" || command.type === "finish") {
      requireValid(
        visit.finishedAt === null,
        "This visit has finished. Start a new visit when returning.",
      );
      if (command.type === "add")
        append(
          command.entryId,
          visit.id,
          command.kind,
          command.amount,
          command.occurredAt,
          command.note,
        );
      else {
        finishedAt = command.finishedAt;
        append(command.entryId, visit.id, "cash_out", command.amount, command.finishedAt);
      }
    } else if (command.type === "reopen") {
      requireValid(visit.finishedAt !== null, "Visit is already live.");
      requireValid(
        !openAt(visit.tableId, visit.playerId),
        "This player is playing at this table again. Correct that visit instead.",
      );
      finishedAt = null;
      const final = state.receipts.reduce<EntryId | null>(
        (current, receipt) =>
          receipt.command.visitId === visit.id ? finalCashOut(current, receipt.command) : current,
        null,
      );
      entries = entries.map((entry) =>
        entry.id === final
          ? PlayEntry.make({
              ...entry,
              voidedAt: command.preparedAt,
              voidedBy: command.actorId,
              voidReason: command.reason,
            })
          : entry,
      );
    } else {
      const original = entries.find((entry) => entry.id === command.entryId);
      requireValid(
        original && original.visitId === visit.id && original.voidedAt === null,
        "Correction target is missing or already voided.",
      );
      requireValid(
        ms(command.preparedAt) >= ms(original.createdAt),
        "Correction predates the original audit.",
      );
      entries = entries.map((entry) =>
        entry.id === original.id
          ? PlayEntry.make({
              ...entry,
              voidedAt: command.preparedAt,
              voidedBy: command.actorId,
              voidReason: command.reason,
            })
          : entry,
      );
      if (command.replacement !== null) {
        const replacement = command.replacement;
        append(
          replacement.id,
          visit.id,
          original.kind,
          replacement.amount,
          replacement.occurredAt,
          replacement.note,
          original.id,
        );
      }
    }
    visits = visits.map((item) =>
      item.id === visit.id
        ? Visit.make({ ...visit, finishedAt, revision: visit.revision + 1 })
        : item,
    );
  }
  return {
    ...state,
    players,
    tables,
    visits,
    entries,
    receipts: [...state.receipts, { command, revision: state.receipts.length + 2 }],
  };
};
