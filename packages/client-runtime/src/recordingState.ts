import {
  Actor,
  PlayEntry,
  PlayerId,
  PlayerIdentity,
  SeatingId,
  Table,
  TableId,
  UserId,
  Venue,
  Visit,
  VisitSeating,
  type EntryId,
} from "@stacks/contracts";
import {
  isSeatingCommand,
  isTableCommand,
  RecordingCommand,
  RecordingOperationId,
  RecordingRejectionReason,
  type TableDetails,
  type VisitCommand,
} from "@stacks/contracts/recordingCommands";
import {
  applyRecordingCommand,
  finalCashOut,
  RecordingError,
  RecordingReceipt,
  visitLiveEntryIds,
} from "@stacks/shared/recording";
import { normalizeTableSeats, sameSeats, seatingSeats, tableSizes } from "@stacks/shared/seats";
import { visitSummary } from "@stacks/shared/visits";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

export { applyRecordingCommand, RecordingError, RecordingReceipt } from "@stacks/shared/recording";

import { normalizeGameName } from "@stacks/shared/recording";

const applyReceipt = <S extends RecordingState>(state: S, command: RecordingCommand) =>
  applyRecordingCommand(state, command, command.actorId === state.actor.id ? undefined : null);

/** A command the server refused, kept out of the ledger until it's recorded again or discarded. */
export const RecordingRejection = Schema.Struct({
  command: RecordingCommand,
  reason: RecordingRejectionReason,
  message: Schema.String,
});

export type RecordingRejection = typeof RecordingRejection.Type;

const RecordingSync = Schema.Struct({
  userId: Schema.NullOr(UserId),
  synced: Schema.Array(RecordingOperationId),
  rejected: Schema.Array(RecordingRejection),
});

const AtTable = Schema.Struct({ tableId: TableId, playerId: PlayerId });

/** What the device keeps of a venue its sessions use, so its name shows offline and signed out. */
export const CachedVenue = Schema.Struct({
  id: Venue.fields.id,
  name: Venue.fields.name,
  kind: Venue.fields.kind,
  city: Venue.fields.city,
  region: Venue.fields.region,
  country: Venue.fields.country,
  lat: Venue.fields.lat,
  lng: Venue.fields.lng,
});

export type CachedVenue = typeof CachedVenue.Type;

const toCachedVenue = ({ id, name, kind, city, region, country, lat, lng }: CachedVenue) => ({
  id,
  name,
  kind,
  city,
  region,
  country,
  lat,
  lng,
});

export const RecordingState = Schema.Struct({
  version: Schema.Literal(2),
  self: PlayerIdentity,
  actor: Actor,
  ownedPlayerIds: Schema.optionalKey(Schema.Array(PlayerId)),
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
  seatings: Schema.Array(VisitSeating),
  receipts: Schema.Array(RecordingReceipt),
  sync: Schema.optionalKey(RecordingSync),
  /**
   * Venues the device has seen a table use, kept beside the ledger rather than rebuilt from it:
   * commands carry only a venue's ID.
   */
  venues: Schema.Array(CachedVenue),
});

export type RecordingState = typeof RecordingState.Type;

/** The state with these venues cached, replacing older copies; unchanged if it has them all. */
export const rememberVenues = (state: RecordingState, venues: ReadonlyArray<CachedVenue>) => {
  const known = new Map(state.venues.map((venue) => [venue.id, venue]));

  const fresh = venues.flatMap((venue) => {
    const cached = toCachedVenue(venue);

    return JSON.stringify(known.get(cached.id)) !== JSON.stringify(cached) ? [cached] : [];
  });

  if (fresh.length === 0) return state;

  for (const venue of fresh) known.set(venue.id, venue);

  return { ...state, venues: [...known.values()] };
};

/** Venues the device's tables use that it hasn't cached yet. */
export const missingVenueIds = (state: RecordingState) => {
  const known = new Set(state.venues.map((venue) => venue.id));

  return [
    ...new Set(
      state.tables.flatMap((table) =>
        table.venueId !== null && !known.has(table.venueId) ? [table.venueId] : [],
      ),
    ),
  ];
};

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
 * The tables someone else started, as they were before `commands`: a deletion among them is
 * replayed, so the table starts undeleted and the commands before it still apply.
 */
export const foreignTables = (
  tables: ReadonlyArray<Table>,
  self: PlayerId,
  commands: ReadonlyArray<RecordingCommand>,
) => {
  const deleted = new Set(
    commands.flatMap((command) => (command.type === "delete_table" ? [command.tableId] : [])),
  );

  return tables.flatMap((table) => {
    if (table.starterPlayerId === self) return [];
    const { deletedAt, ...rest } = table;

    return [deletedAt !== undefined && !deleted.has(table.id) ? { ...rest, deletedAt } : rest];
  });
};

/**
 * The ledger before any command: the device's own player, who is at which tables, and the tables
 * others started. Commands rebuild everything else, including the players they added.
 */
export const recordingBase = (state: RecordingState) => {
  const joined = new Set(state.participants.map((item) => item.playerId));
  const created = new Set(state.receipts.map((receipt) => added(receipt.command)));

  return {
    ...state,
    players: state.players.filter(
      (player) => player.id === state.self.id || joined.has(player.id) || !created.has(player.id),
    ),
    recorders: [],
    tables: foreignTables(
      state.tables,
      state.self.id,
      state.receipts.map((receipt) => receipt.command),
    ),
    visits: [],
    entries: [],
    seatings: [],
    receipts: [],
  };
};

const validateRecordingState = (state: RecordingState) => {
  requireValid(
    new Set(state.ownedPlayerIds ?? []).size === (state.ownedPlayerIds ?? []).length,
    "Owned player IDs must be unique.",
  );
  requireValid(state.actor.userId === null, "Private recording has a local actor.");
  requireValid(
    unique(state.players) &&
      unique(state.tables) &&
      unique(state.visits) &&
      unique(state.entries) &&
      unique(state.seatings) &&
      unique(state.venues),
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
  const seatings = new Map(state.seatings.map((seating) => [seating.id, seating]));
  const participants = new Set(state.participants.map((item) => item.playerId));
  requireValid(
    new Set(state.participants.map((item) => `${item.tableId}:${item.playerId}`)).size ===
      state.participants.length &&
      !participants.has(state.self.id) &&
      state.participants.every((item) => tables.has(item.tableId) && players.has(item.playerId)),
    "Invalid table participant.",
  );
  const joined = new Set<Table["id"]>();

  for (const table of state.tables) {
    if (table.starterPlayerId === state.self.id) continue;
    requireValid(
      state.participants.some((item) => item.tableId === table.id),
      "Foreign table ownership.",
    );
    joined.add(table.id);
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

  for (const seating of state.seatings) {
    const visit = visits.get(seating.visitId);
    requireValid(visit !== undefined, "Foreign seating ownership.");
    requireValid(
      seating.voidedAt !== null ||
        (ms(seating.occurredAt) >= ms(visit.startedAt) &&
          (visit.finishedAt === null || ms(seating.occurredAt) <= ms(visit.finishedAt))),
      "Seating outside visit times.",
    );
  }

  const operations = new Set<string>();
  const createdEntries = new Set<EntryId>();
  const voids = new Set<EntryId>();
  const createdSeatings = new Set<SeatingId>();
  const voidedSeatings = new Set<SeatingId>();

  const audits = new Map<
    EntryId,
    {
      at: DateTime.Utc;
      by: RecordingCommand["actorId"];
      reason: string;
      source: "reopen" | "correct" | "delete_visit";
    }
  >();

  const seatingAudits = new Map<
    SeatingId,
    { at: DateTime.Utc; by: RecordingCommand["actorId"]; reason: string }
  >();

  const deleted = new Map<Visit["id"], DateTime.Utc>();
  const deletedEntries = new Map<Visit["id"], ReadonlySet<EntryId>>();
  const lifecycle = new Map<Visit["id"], { revision: number; finishedAt: DateTime.Utc | null }>();
  const finals = new Map<Visit["id"], EntryId | null>();
  const createdTables = new Set<Table["id"]>();
  const createdPlayers = new Set<PlayerIdentity["id"]>();
  const recorders = new Set<string>();
  const starts = new Map<Visit["id"], DateTime.Utc>();
  const details = new Map<Table["id"], TableDetails>();
  const tableSeatsMap = new Map<Table["id"], number | null>();
  const trips = new Map<Table["id"], Table["tripId"]>();
  const deletedTables = new Map<Table["id"], DateTime.Utc>();

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

  for (const [index, receipt] of state.receipts.entries()) {
    const command = receipt.command;
    requireValid(
      !operations.has(command.operationId) &&
        receipt.revision === index + 2 &&
        (command.actorId === state.actor.id || synced.has(command.operationId)),
      "Invalid command receipt.",
    );
    operations.add(command.operationId);

    if (command.type === "open_table") {
      const table = tables.get(command.tableId);
      requireValid(
        table && !createdTables.has(table.id) && table.starterPlayerId === command.playerId,
        "Duplicate or missing start records.",
      );
      createdTables.add(table.id);
      trips.set(table.id, null);
      tableSeatsMap.set(table.id, normalizeTableSeats(command.game, command.tableSeats));
      details.set(
        table.id,
        command.gameName === undefined
          ? { game: command.game, venueId: command.venueId, highLimit: command.highLimit }
          : {
              game: command.game,
              gameName: command.gameName,
              venueId: command.venueId,
              highLimit: command.highLimit,
            },
      );
      continue;
    }

    if (isTableCommand(command)) {
      requireValid(
        tables.has(command.tableId) && !deletedTables.has(command.tableId),
        "Table command references a missing table.",
      );

      if (command.type === "delete_table") {
        deletedTables.set(command.tableId, command.preparedAt);
        trips.set(command.tableId, null);
        continue;
      }

      if (command.type === "set_table_trip") {
        requireValid(tables.has(command.tableId), "Trip choice references a missing table.");
        trips.set(command.tableId, command.tripId);
        continue;
      }

      if (command.type === "set_table_seats") {
        const game =
          details.get(command.tableId)?.game ?? tables.get(command.tableId)?.game ?? null;

        requireValid(
          game !== null && tableSizes[game] !== undefined,
          "Table size command for non-seated game.",
        );
        tableSeatsMap.set(command.tableId, normalizeTableSeats(game, command.tableSeats));
        continue;
      }

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
        visit.tableId === table.id && visit.playerId === command.playerId,
        "Join records differ from the receipt.",
      );
      starts.set(visit.id, command.startedAt);
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
        visit.tableId === table.id && visit.playerId === command.playerId,
        "Start records differ from the receipt.",
      );
      createdTables.add(table.id);
      trips.set(table.id, null);
      starts.set(visit.id, command.startedAt);
      tableSeatsMap.set(table.id, normalizeTableSeats(command.game, command.tableSeats));
      details.set(
        table.id,
        command.gameName === undefined
          ? { game: command.game, venueId: command.venueId, highLimit: command.highLimit }
          : {
              game: command.game,
              gameName: command.gameName,
              venueId: command.venueId,
              highLimit: command.highLimit,
            },
      );
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
    } else if (isSeatingCommand(command)) {
      requireValid(
        visit.tableId === command.tableId && lifecycle.has(visit.id) && !deleted.has(visit.id),
        "Invalid seating history.",
      );

      if (command.type === "set_seat") {
        const seating = seatings.get(command.seatingId);
        requireValid(
          seating && !createdSeatings.has(command.seatingId),
          "Seating receipt is missing or duplicated.",
        );
        requireValid(
          seating.visitId === command.visitId &&
            sameSeats(seatingSeats(seating), seatingSeats(command)) &&
            ms(seating.occurredAt) === ms(command.occurredAt) &&
            seating.createdBy === command.actorId &&
            ms(seating.createdAt) === ms(command.preparedAt),
          "Seating differs from its command receipt.",
        );
        createdSeatings.add(command.seatingId);

        if (command.replacesSeatingId !== undefined) {
          requireValid(command.reason !== undefined, "Seat replacement missing reason.");
          const original = seatings.get(command.replacesSeatingId);
          requireValid(
            original &&
              original.visitId === visit.id &&
              createdSeatings.has(original.id) &&
              !voidedSeatings.has(original.id),
            "Invalid seating correction history.",
          );
          seatingAudits.set(original.id, {
            at: command.preparedAt,
            by: command.actorId,
            reason: command.reason,
          });
          voidedSeatings.add(original.id);
        }
      } else {
        const target = seatings.get(command.seatingId);
        requireValid(
          target &&
            target.visitId === visit.id &&
            createdSeatings.has(target.id) &&
            !voidedSeatings.has(target.id),
          "Invalid seating void history.",
        );
        seatingAudits.set(target.id, {
          at: command.preparedAt,
          by: command.actorId,
          reason: command.reason,
        });
        voidedSeatings.add(target.id);
      }

      continue;
    } else {
      const previous = lifecycle.get(visit.id);
      requireValid(
        previous && previous.revision === command.expectedRevision,
        "Invalid visit revision history.",
      );
      previous.revision += 1;
      requireValid(
        command.type === "restore_visit" ? deleted.has(visit.id) : !deleted.has(visit.id),
        "Invalid deletion history.",
      );

      if (command.type === "delete_visit") {
        deleted.set(visit.id, command.preparedAt);
        const live = visitLiveEntryIds(state.receipts.slice(0, index), visit.id);
        deletedEntries.set(visit.id, live);

        for (const id of live) {
          voids.add(id);
          audits.set(id, {
            at: command.preparedAt,
            by: command.actorId,
            reason: "Session deleted",
            source: "delete_visit",
          });
        }
      } else if (command.type === "restore_visit") {
        deleted.delete(visit.id);

        for (const id of deletedEntries.get(visit.id) ?? []) {
          voids.delete(id);
          audits.delete(id);
        }

        deletedEntries.delete(visit.id);
      } else if (command.type === "add" || command.type === "finish") {
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
      } else if (command.type === "edit_visit") {
        if (command.startedAt !== undefined) starts.set(visit.id, command.startedAt);

        if (command.table !== undefined) {
          details.set(visit.tableId, command.table);

          const currentSeats = tableSeatsMap.has(visit.tableId)
            ? tableSeatsMap.get(visit.tableId)!
            : (tables.get(visit.tableId)?.tableSeats ?? null);

          const nextRaw =
            command.table.tableSeats !== undefined
              ? command.table.tableSeats
              : command.table.game !== null && tableSizes[command.table.game]
                ? currentSeats
                : null;

          tableSeatsMap.set(visit.tableId, normalizeTableSeats(command.table.game, nextRaw));
        }
      } else if (command.type === "reopen") {
        requireValid(previous.finishedAt !== null, "Receipt reopens a live visit.");
        previous.finishedAt = null;
        const final = finals.get(visit.id);

        if (final) {
          requireValid(entries.has(final) && !voids.has(final), reopenNotVoided);
          audits.set(final, {
            at: command.preparedAt,
            by: command.actorId,
            reason: command.reason,
            source: "reopen",
          });
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
        audits.set(original.id, {
          at: command.preparedAt,
          by: command.actorId,
          reason: command.reason,
          source: "correct",
        });
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
      createdSeatings.size === seatings.size &&
      new Set([...createdTables, ...joined]).size === tables.size &&
      lifecycle.size === visits.size,
    "Records have missing command receipts.",
  );

  for (const entry of state.entries) {
    const audit = audits.get(entry.id);
    requireValid(
      audit === undefined ||
        (entry.voidedAt !== null &&
          ms(entry.voidedAt) === ms(audit.at) &&
          entry.voidedBy === audit.by &&
          entry.voidReason === audit.reason),
      audit?.source === "reopen" ? reopenNotVoided : "Void differs from its command receipt.",
    );
    requireValid(
      (entry.voidedAt !== null) === voids.has(entry.id),
      "Void has no correction receipt.",
    );
  }

  for (const seating of state.seatings) {
    const audit = seatingAudits.get(seating.id);
    requireValid(
      audit === undefined ||
        (seating.voidedAt !== null &&
          ms(seating.voidedAt) === ms(audit.at) &&
          seating.voidedBy === audit.by &&
          seating.voidReason === audit.reason),
      "Seating void differs from its command receipt.",
    );
    requireValid(
      (seating.voidedAt !== null) === voidedSeatings.has(seating.id),
      "Seating void has no receipt.",
    );
  }

  for (const visit of state.visits) {
    const at = deleted.get(visit.id);
    requireValid(
      at === undefined
        ? visit.deletedAt === undefined
        : visit.deletedAt !== undefined && ms(at) === ms(visit.deletedAt),
      "Visit deletion differs from its receipts.",
    );
  }

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

  for (const visit of state.visits) {
    const start = starts.get(visit.id);
    requireValid(
      start !== undefined && ms(start) === ms(visit.startedAt),
      "Visit start differs from its receipts.",
    );
  }

  for (const table of state.tables.filter((item) => createdTables.has(item.id))) {
    const at = deletedTables.get(table.id);
    requireValid(
      at === undefined
        ? table.deletedAt === undefined
        : table.deletedAt !== undefined && ms(at) === ms(table.deletedAt),
      "Table deletion differs from its receipts.",
    );
  }

  for (const [tableId, tripId] of trips)
    requireValid(tables.get(tableId)?.tripId === tripId, "Table trip differs from its receipts.");

  for (const [tableId, expected] of details) {
    const table = tables.get(tableId);
    requireValid(
      table &&
        table.game === expected.game &&
        (table.gameName ?? null) === normalizeGameName(expected.game, expected.gameName) &&
        table.venueId === expected.venueId &&
        table.highLimit === expected.highLimit,
      "Table differs from its receipts.",
    );
  }

  for (const [tableId, expectedSeats] of tableSeatsMap)
    requireValid(
      (tables.get(tableId)?.tableSeats ?? null) === expectedSeats,
      "Table seats differ from receipts.",
    );

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

const Fields = Schema.Record(Schema.String, Schema.Unknown);
const VersionMarker = Schema.Struct({ version: Schema.Literal(1) });
const CommandType = Schema.Struct({ type: Schema.String });

const SyncRejected = Schema.Struct({
  rejected: Schema.Array(Fields),
});

const decodeFields = Schema.decodeUnknownSync(Fields);

const namedCommand = (command: typeof Schema.Unknown.Encoded, selfId: string) => {
  const fields = decodeFields(command);
  const { type } = Schema.decodeUnknownSync(CommandType)(command);

  return type === "start" || type === "record_completed" ? { ...fields, playerId: selfId } : fields;
};

const withDefaults = (document: typeof Schema.Unknown.Encoded) => {
  const fields = Schema.decodeUnknownOption(Fields)(document);

  if (Option.isNone(fields)) return document;

  const { repayments, ...rest } = fields.value;

  return {
    participants: [],
    recorders: [],
    seatings: [],
    venues: [],
    ...(Array.isArray(repayments) && repayments.length === 0 ? rest : fields.value),
  };
};

const fromVersionOne = (document: typeof Schema.Unknown.Encoded) => {
  if (Option.isNone(Schema.decodeUnknownOption(VersionMarker)(document))) return document;
  const fields = decodeFields(document);
  const self = decodeFields(fields.self);
  const selfId = Schema.decodeUnknownSync(Schema.String)(self.id);
  const tables = Schema.decodeUnknownSync(Schema.Array(Schema.Unknown))(fields.tables);
  const receipts = Schema.decodeUnknownSync(Schema.Array(Fields))(fields.receipts);
  const sync = Schema.decodeUnknownOption(SyncRejected)(fields.sync);

  const migrated = {
    ...fields,
    version: 2,
    players: [self],
    tables: tables.map((table) => {
      const row = decodeFields(table);
      const { starterActorId: _previousActor, ...rest } = row;

      return { ...rest, starterPlayerId: selfId };
    }),
    receipts: receipts.map((receipt) => ({
      ...receipt,
      command: namedCommand(receipt.command, selfId),
    })),
  };

  if (Option.isNone(sync)) return migrated;

  return {
    ...migrated,
    sync: {
      ...decodeFields(fields.sync),
      rejected: sync.value.rejected.map((item) => ({
        ...item,
        command: namedCommand(item.command, selfId),
      })),
    },
  };
};

export const decodeRecordingState = (payload: string, revision: number) => {
  try {
    const state = validateOrUpgrade(
      Schema.decodeUnknownSync(codec)(withDefaults(fromVersionOne(JSON.parse(payload))), {
        onExcessProperty: "error",
      }),
    );

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
