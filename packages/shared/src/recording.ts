import {
  Actor,
  PlayEntry,
  PlayerIdentity,
  Table,
  Visit,
  type EntryId,
  type PlayerId,
  type TableId,
} from "@stacks/contracts";
import { isTableCommand, RecordingCommand } from "@stacks/contracts/recordingCommands";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";

export const RecordingReceipt = Schema.Struct({
  command: RecordingCommand,
  revision: Schema.Int.check(Schema.isGreaterThan(1)),
});
export type RecordingReceipt = typeof RecordingReceipt.Type;

/** A player at a table: who joined it through its link or an invite, or who records for it. */
export interface Participant {
  readonly tableId: TableId;
  readonly playerId: PlayerId;
}

/**
 * The tables one actor records at, as it applies commands to them, on a device or on the server.
 * `players` are the ones it may start visits for: `self`, the players it added, and the players
 * in `participants`: who joined its tables, or who it joined other tables as.
 */
export interface RecordingLedger {
  readonly self: PlayerIdentity;
  readonly actor: Actor;
  readonly players: ReadonlyArray<PlayerIdentity>;
  readonly participants: ReadonlyArray<Participant>;
  /** The players the starters appointed to record for everyone at their tables. */
  readonly recorders: ReadonlyArray<Participant>;
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

const at = (items: ReadonlyArray<Participant>, tableId: TableId, playerId: PlayerId) =>
  items.some((item) => item.tableId === tableId && item.playerId === playerId);

/**
 * Whether an actor holding `actorPlayers` may write `playerId`'s play at a table. Its starter and
 * the recorders it appointed record for everyone; a player who joined it records only their own.
 */
export const authorize = (
  table: Pick<Table, "id" | "starterPlayerId">,
  actorPlayers: ReadonlyArray<PlayerId>,
  playerId: PlayerId,
  participants: ReadonlyArray<Participant>,
  recorders: ReadonlyArray<Participant>,
) =>
  actorPlayers.includes(table.starterPlayerId) ||
  actorPlayers.some((player) => at(recorders, table.id, player)) ||
  (actorPlayers.includes(playerId) && at(participants, table.id, playerId));

/** The players a device records as: its own, and the ones it joined other tables as. */
export const ownPlayers = (state: RecordingLedger): ReadonlyArray<PlayerId> => [
  state.self.id,
  ...state.participants
    .filter(
      (item) =>
        state.tables.find((table) => table.id === item.tableId)?.starterPlayerId !== state.self.id,
    )
    .map((item) => item.playerId),
];

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
 * its own players; on the server, what the database binds to the authenticated actor. `null`
 * applies a command the server already accepted, from whichever actor made it: a device can't
 * know another actor's players, and the server checked them.
 */
export const applyRecordingCommand = <S extends RecordingLedger>(
  state: S,
  command: RecordingCommand,
  actorPlayers: ReadonlyArray<PlayerId> | null = ownPlayers(state),
): S => {
  requireValid(
    actorPlayers === null || command.actorId === state.actor.id,
    "Command has a foreign local actor.",
  );
  const forbid = (table: Pick<Table, "id" | "starterPlayerId">, playerId: PlayerId) => {
    if (
      actorPlayers !== null &&
      !authorize(table, actorPlayers, playerId, state.participants, state.recorders)
    )
      throw new RecordingError("forbidden", "You can record only your own play at this table.");
  };
  const receipts = [...state.receipts, { command, revision: state.receipts.length + 2 }];
  if (isTableCommand(command)) {
    const table = state.tables.find((table) => table.id === command.tableId);
    requireValid(table, "Table does not exist.");
    // Only the server knows who has an account and every way a player came to the table.
    if (actorPlayers !== null && !actorPlayers.includes(table.starterPlayerId))
      throw new RecordingError("forbidden", "Only the player who started this table can do that.");
    const appointed = at(state.recorders, table.id, command.playerId);
    requireValid(
      command.type === "appoint_recorder" ? !appointed : appointed,
      command.type === "appoint_recorder"
        ? "This player already records for the table."
        : "This player doesn't record for the table.",
    );
    return {
      ...state,
      recorders:
        command.type === "appoint_recorder"
          ? [...state.recorders, { tableId: table.id, playerId: command.playerId }]
          : state.recorders.filter(
              (item) => item.tableId !== table.id || item.playerId !== command.playerId,
            ),
      receipts,
    };
  }
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
    counterpartyId: PlayerId | null = null,
  ) => {
    requireValid(!entries.some((entry) => entry.id === id), "Entry ID is already used.");
    requireValid(
      counterpartyId === null ||
        (kind !== "adjustment" &&
          counterpartyId !== visits.find((visit) => visit.id === visitId)?.playerId),
      "Leave Paid by and Paid to empty for the player's own money.",
    );
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
        counterpartyId,
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
      forbid(table, command.playerId);
      // A player the server already holds came with the history, as someone at the table.
      const known =
        actorPlayers === null && players.some((player) => player.id === command.playerId);
      if (command.newPlayer && !known) {
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
      if (actorPlayers !== null && command.playerId !== state.self.id)
        throw new RecordingError("forbidden", "Start a table as yourself.");
      // A table someone else started came with the history; its start only adds their visit.
      const known = actorPlayers === null && tables.some((table) => table.id === command.tableId);
      requireValid(
        !visits.some((visit) => visit.id === command.visitId) &&
          (known || !tables.some((table) => table.id === command.tableId)),
        "Start IDs are already used.",
      );
      if (!known)
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
    append(
      command.buyInId,
      command.visitId,
      "buy_in",
      command.buyIn,
      command.startedAt,
      null,
      null,
      command.type === "join_table" ? (command.counterpartyId ?? null) : null,
    );
    if (command.type === "record_completed")
      append(command.cashOutId, command.visitId, "cash_out", command.cashOut, command.finishedAt);
  } else {
    const visit = visits.find((visit) => visit.id === command.visitId);
    requireValid(visit, "Visit does not exist.");
    const table = tables.find((table) => table.id === visit.tableId);
    requireValid(table, "Table does not exist.");
    forbid(table, visit.playerId);
    if (visit.revision !== command.expectedRevision)
      throw new RecordingError(
        "conflict",
        "Visit changed. Review it before preparing another command.",
      );
    requireValid(visit.revision < Number.MAX_SAFE_INTEGER, "Visit revision overflow.");
    let finishedAt = visit.finishedAt;
    let startedAt = visit.startedAt;
    if (command.type === "edit_visit") {
      requireValid(
        command.startedAt !== undefined || command.table !== undefined,
        "Change the start time, game or venue.",
      );
      if (command.startedAt !== undefined) {
        const start = command.startedAt;
        requireValid(
          finishedAt === null || ms(start) <= ms(finishedAt),
          "The start time can't be after the session finished.",
        );
        requireValid(
          entries.every((entry) => entry.visitId !== visit.id || ms(entry.occurredAt) >= ms(start)),
          "The start time can't be after the first buy-in.",
        );
        startedAt = start;
      }
      if (command.table !== undefined) {
        if (
          actorPlayers !== null &&
          !authorize(
            table,
            actorPlayers,
            table.starterPlayerId,
            state.participants,
            state.recorders,
          )
        )
          throw new RecordingError(
            "forbidden",
            "Only whoever records for everyone at this table can change its game or venue.",
          );
        const index = tables.findIndex((item) => item.id === table.id);
        tables[index] = Table.make({ ...table, ...command.table });
      }
    } else if (command.type === "add" || command.type === "finish") {
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
          null,
          command.counterpartyId ?? null,
        );
      else {
        finishedAt = command.finishedAt;
        append(
          command.entryId,
          visit.id,
          "cash_out",
          command.amount,
          command.finishedAt,
          null,
          null,
          command.counterpartyId ?? null,
        );
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
          "visitId" in receipt.command && receipt.command.visitId === visit.id
            ? finalCashOut(current, receipt.command)
            : current,
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
          replacement.counterpartyId ?? null,
        );
      }
    }
    visits = visits.map((item) =>
      item.id === visit.id
        ? Visit.make({ ...visit, startedAt, finishedAt, revision: visit.revision + 1 })
        : item,
    );
  }
  return {
    ...state,
    players,
    tables,
    visits,
    entries,
    receipts,
  };
};
