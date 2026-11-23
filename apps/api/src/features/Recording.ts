import * as Data from "effect/Data";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import {
  ActorId,
  Conflict,
  CurrentUser,
  Forbidden,
  groupScope,
  NotFound,
  PlayEntry,
  PlayerIdentity,
  Recorder,
  ScopeCloseCode,
  Table,
  tableScope,
  Unauthorized,
  Visit,
  type GroupId,
  type PlayerId,
  type TableId,
  type TripId,
} from "@stacks/contracts";
import {
  isTableCommand,
  RecordingCommand,
  type ActorCredential,
  type ClaimActorRequest,
  type ClaimResult,
  type JoinedTable,
  type JoinTableRequest,
  type PushRecordingRequest,
  type RecordingIdentity as RecordingIdentityType,
  type RecordingCommandResult,
  type RecordingRejectionReason,
  type TableView,
} from "@stacks/contracts/recordingCommands";
import {
  applyRecordingCommand,
  createdEntryIds,
  RecordingError,
  type RecordingLedger,
} from "@stacks/shared/recording";
import { visitSummary } from "@stacks/shared/visits";

import {
  PersonalEntryRow,
  PersonalOperationRow,
  PersonalVisitRow,
  ParticipantRow,
  PlayerIdentityRow,
  RecordingIdentityRow,
  TableRow,
} from "../db/rows.ts";
import * as Access from "./Access.ts";
import * as Realtime from "./Realtime.ts";
import * as Venues from "./Venues.ts";

class Rejected extends Data.TaggedError("Rejected")<{
  readonly reason: RecordingRejectionReason;
  readonly message: string;
}> {}

type Identity = typeof RecordingIdentityRow.Type;

interface Principal {
  readonly self: Identity | null;
  readonly actorPlayers: ReadonlyArray<PlayerId>;
}

const sessionRecorded = {
  reason: "conflict",
  message: "This session is already recorded.",
} as const;

const entryRecorded = {
  reason: "conflict",
  message: "An entry with this ID is already recorded.",
} as const;

const playerRecorded = {
  reason: "conflict",
  message: "A player with this ID is already recorded.",
} as const;

const forbidden = {
  reason: "forbidden",
  message: "You can record only your own play at this table.",
} as const;

const readOnly = {
  reason: "invalid",
  message: "Imported history is read-only.",
} as const;

const notAtTable = {
  reason: "invalid",
  message: "Paid by and Paid to must be someone at this table.",
} as const;

const commandJson = Schema.encodeSync(Schema.toCodecJson(RecordingCommand));
const commandText = (command: RecordingCommand) => JSON.stringify(commandJson(command));
const date = DateTime.toDateUtc;

/** Secrets and tokens are 32 random bytes, so a fast hash is enough to keep them unusable. */
export const digest = (secret: string) =>
  Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret))).pipe(
    Effect.map((hash) => Buffer.from(hash).toString("hex")),
  );

const personalIdentity = Effect.fn("Recording.personalIdentity")(function* (userId: string) {
  const sql = yield* SqlClient.SqlClient;

  const [row] = yield* sql`
    select id as player_id, recording_actor_id as actor_id, display_name
    from players where user_id = ${userId} and recording_actor_id is not null
  `.pipe(Effect.flatMap(Access.decodeRows(RecordingIdentityRow)));

  return row ?? null;
});

const verifiedActor = Effect.fn("Recording.verifiedActor")(function* (
  actorId: string,
  secret: string,
) {
  const sql = yield* SqlClient.SqlClient;
  const id = Option.getOrNull(Schema.decodeUnknownOption(ActorId)(actorId));

  if (id === null) return yield* new Unauthorized();

  const [row] = yield* sql<{ secretHash: string }>`
    select secret_hash from recording_actors where id = ${id} and kind = 'device'
  `;

  if (!row || row.secretHash !== (yield* digest(secret))) return yield* new Unauthorized();

  return id;
});

export const randomToken = () =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");

const tablePlayers = (sql: SqlClient.SqlClient) => sql`(
  select table_id, player_id from table_participants
  union
  select v.table_id, v.player_id from personal_visits v
  where exists (
    select 1 from player_actors pa
    where pa.player_id = v.player_id and pa.bound_via = 'invite' and pa.revoked_at is null
  )
)`;

const tableRecorders = (sql: SqlClient.SqlClient) => sql`(
  select table_id, player_id from (
    select distinct on (table_id, command ->> 'playerId')
      table_id, (command ->> 'playerId')::uuid as player_id, command ->> 'type' as type
    from personal_operations where visit_id is null and table_id is not null
      and command ->> 'type' in ('appoint_recorder', 'revoke_recorder')
    order by table_id, command ->> 'playerId', seq desc
  ) latest where type = 'appoint_recorder'
)`;

const boundPlayers = Effect.fn("Recording.boundPlayers")(function* (actorId: string) {
  const sql = yield* SqlClient.SqlClient;

  return yield* sql<{ playerId: PlayerId }>`
    select player_id from player_actors where actor_id = ${actorId} and revoked_at is null
  `.pipe(Effect.map((rows) => rows.map((row) => row.playerId)));
});

export const principal = Effect.fn("Recording.principal")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const recorder = yield* Recorder;

  if (Predicate.isTagged(recorder, "Account")) {
    const self = yield* personalIdentity(recorder.user.userId);

    const principal: Principal = {
      self,
      actorPlayers: self ? yield* boundPlayers(self.actorId) : [],
    };

    return principal;
  }

  const actorId = yield* verifiedActor(recorder.actorId, recorder.secret);

  const [self] = yield* sql`
    select p.id as player_id, pa.actor_id, p.display_name
    from player_actors pa join players p on p.id = pa.player_id
    where pa.actor_id = ${actorId} and pa.bound_via = 'self'
  `.pipe(Effect.flatMap(Access.decodeRows(RecordingIdentityRow)));

  const principal: Principal = { self: self ?? null, actorPlayers: yield* boundPlayers(actorId) };

  return principal;
});

const tableFields = (row: typeof TableRow.Type) => {
  const base = {
    id: row.id,
    tripId: row.tripId,
    game: row.game,
    venueId: row.venueId,
    highLimit: row.highLimit,
  };

  if (row.gameName !== null && row.deletedAt !== null) {
    return { ...base, gameName: row.gameName, deletedAt: row.deletedAt };
  }

  if (row.gameName !== null) return { ...base, gameName: row.gameName };

  if (row.deletedAt !== null) return { ...base, deletedAt: row.deletedAt };

  return base;
};

const tableOf = (row: typeof TableRow.Type, starterPlayerId: PlayerId) =>
  Table.make({ ...tableFields(row), starterPlayerId });

const visitOf = (visit: typeof PersonalVisitRow.Type) => {
  const base = {
    id: visit.id,
    tableId: visit.tableId,
    playerId: visit.playerId,
    startedAt: visit.startedAt,
    finishedAt: visit.finishedAt,
    revision: visit.revision,
  };

  return Visit.make(visit.deletedAt === null ? base : { ...base, deletedAt: visit.deletedAt });
};

const entryOf = (entry: typeof PersonalEntryRow.Type) =>
  PlayEntry.make({ ...entry, currency: "USD" });

const open = (sql: SqlClient.SqlClient) => sql`(
  tables.deleted_at is null and (
    not exists (select 1 from personal_visits where table_id = tables.id)
    or exists (select 1 from personal_visits where table_id = tables.id and deleted_at is null)))`;

export const groupOfTrip = Effect.fn("Recording.groupOfTrip")(function* (tripId: TripId | null) {
  if (tripId === null) return null;
  const sql = yield* SqlClient.SqlClient;
  const [row] = yield* sql<{ groupId: GroupId }>`select group_id from trips where id = ${tripId}`;

  return row?.groupId ?? null;
});

const tableChanged = Effect.fn("Recording.tableChanged")(function* (
  tableId: TableId,
  trips: ReadonlyArray<TripId | null>,
) {
  yield* Realtime.changed(tableScope(tableId));

  for (const trip of new Set(trips)) {
    const groupId = yield* groupOfTrip(trip);

    if (groupId !== null) yield* Realtime.changed(groupScope(groupId));
  }
});

const live = (sql: SqlClient.SqlClient) => sql`(
  t.deleted_at is null
  and (
    not exists (select 1 from personal_visits where table_id = t.id)
    or exists (
      select 1 from personal_visits where table_id = t.id and finished_at is null and deleted_at is null
    )
  )
)`;

const playersTables = Effect.fn("Recording.playersTables")(function* (
  players: ReadonlyArray<PlayerId>,
) {
  const sql = yield* SqlClient.SqlClient;
  const mine = sql.in(players);

  return yield* sql<{ id: TableId; tripId: TripId | null }>`
    with at as (
      select id from tables where starter_player_id in ${mine}
      union select table_id from personal_visits where player_id in ${mine} and deleted_at is null
      union select table_id from table_participants where player_id in ${mine}
    )
    select t.id, t.trip_id from tables t join at on at.id = t.id
    where ${live(sql)}
  `;
});

/**
 * Who may record for these players, or as whom, changed. Their open tables show it (a table that
 * is over or deleted is nobody's screen), and so do those tables' groups.
 */
export const playersChanged = Effect.fn("Recording.playersChanged")(function* (
  players: ReadonlyArray<PlayerId>,
) {
  if (players.length === 0) return;

  for (const table of yield* playersTables(players)) yield* tableChanged(table.id, [table.tripId]);
});

/**
 * These devices stopped recording for the player, so on the player's open tables the sockets they
 * opened as themselves close. A device that also records through another player, or starts the
 * table, just reconnects.
 */
export const bindingsRevoked = Effect.fn("Recording.bindingsRevoked")(function* (
  player: PlayerId,
  actors: ReadonlyArray<string>,
) {
  for (const table of yield* playersTables([player])) {
    yield* tableChanged(table.id, [table.tripId]);

    for (const actorId of actors) {
      yield* Realtime.closed({
        scope: tableScope(table.id),
        selector: { kind: "actor", actorId },
        code: ScopeCloseCode.revoked,
      });
    }
  }
});

/**
 * A member left a group or was removed. Its open tables lose the sockets that watched through
 * the membership, not the ones the member opened as a starter or a player.
 */
export const memberGone = Effect.fn("Recording.memberGone")(function* (
  groupId: GroupId,
  userId: string,
) {
  const sql = yield* SqlClient.SqlClient;

  const tables = yield* sql<{ id: TableId }>`
    select t.id from tables t join trips tr on tr.id = t.trip_id
    where tr.group_id = ${groupId} and ${live(sql)}
  `;

  for (const table of tables) {
    yield* Realtime.closed({
      scope: tableScope(table.id),
      selector: { kind: "member", groupId, userId },
      code: ScopeCloseCode.revoked,
    });
  }
});

const participantsAt = Effect.fn("Recording.participantsAt")(function* (tableId: TableId) {
  const sql = yield* SqlClient.SqlClient;

  const rows = yield* sql<{ playerId: PlayerId }>`
    select player_id from ${tablePlayers(sql)} t where table_id = ${tableId}
  `;

  return rows.map((row) => ({ tableId, playerId: row.playerId }));
});

const recordersAt = Effect.fn("Recording.recordersAt")(function* (tableId: TableId) {
  const sql = yield* SqlClient.SqlClient;

  const rows = yield* sql<{ playerId: PlayerId }>`
    select player_id from ${tableRecorders(sql)} r where table_id = ${tableId}
  `;

  return rows.map((row) => ({ tableId, playerId: row.playerId }));
});

const lockTable = Effect.fn("Recording.lockTable")(function* (
  tableId: TableId,
  actorPlayers: ReadonlyArray<PlayerId>,
) {
  const sql = yield* SqlClient.SqlClient;

  const [row] = yield* sql`select * from tables where id = ${tableId} for update`.pipe(
    Effect.flatMap(Access.decodeRows(TableRow)),
  );

  if (!row) return yield* new Rejected({ reason: "invalid", message: "Table does not exist." });

  if (row.starterPlayerId === null) return yield* new Rejected(readOnly);
  const table = tableOf(row, row.starterPlayerId);
  const participants = yield* participantsAt(table.id);
  const recorders = yield* recordersAt(table.id);

  if (
    !actorPlayers.includes(table.starterPlayerId) &&
    !participants.some((item) => actorPlayers.includes(item.playerId)) &&
    !recorders.some((item) => actorPlayers.includes(item.playerId))
  )
    return yield* new Rejected(forbidden);

  return { table, participants, recorders };
});

const loadLedger = Effect.fn("Recording.loadLedger")(function* (
  self: Identity,
  actorPlayers: ReadonlyArray<PlayerId>,
  command: RecordingCommand,
) {
  const sql = yield* SqlClient.SqlClient;
  const me = PlayerIdentity.make({ id: self.playerId, displayName: self.displayName });

  const ledger: RecordingLedger = {
    self: me,
    actor: { id: self.actorId, userId: null },
    players: [me],
    participants: [],
    recorders: [],
    tables: [],
    visits: [],
    entries: [],
    receipts: [],
  };

  if (isTableCommand(command)) {
    const { table, participants, recorders } = yield* lockTable(command.tableId, actorPlayers);

    if (!actorPlayers.includes(table.starterPlayerId))
      return yield* new Rejected({
        reason: "forbidden",
        message: "Only the player who started this table can do that.",
      });

    if (command.type === "set_table_trip" && command.tripId !== null) {
      const recorder = yield* Recorder;

      if (!Predicate.isTagged(recorder, "Account"))
        return yield* new Rejected({ reason: "forbidden", message: "Sign in to choose a trip." });

      const [trip] = yield* sql<{ endedAt: Date | null; currency: string }>`
        select t.ended_at, g.currency from trips t
        join groups g on g.id = t.group_id
        join memberships m on m.group_id = t.group_id
        where t.id = ${command.tripId} and m.user_id = ${recorder.user.userId} and m.left_at is null
        for update of t, m
      `;

      if (!trip)
        return yield* new Rejected({
          reason: "forbidden",
          message: "Choose a trip in a group you belong to.",
        });

      if (trip.currency !== "USD")
        return yield* new Rejected({
          reason: "invalid",
          message: "Tables are recorded in USD. Choose a trip in a USD group.",
        });

      if (trip.endedAt !== null)
        return yield* new Rejected({
          reason: "invalid",
          message: "That trip has ended. Choose a live trip.",
        });

      const stakes =
        yield* sql`select 1 from stakes where trip_id = ${command.tripId} and ended_at is null and voided_at is null`;

      if (stakes.length > 0)
        return yield* new Rejected({
          reason: "invalid",
          message: "That trip has an open stake. End the stake before adding a table.",
        });
    }

    if (command.type === "appoint_recorder") {
      if (!participants.some((item) => item.playerId === command.playerId))
        return yield* new Rejected({
          reason: "invalid",
          message: "Only a player who joined this table can record for it.",
        });

      const account = yield* sql`
        select 1 from player_actors pa join recording_actors a on a.id = pa.actor_id
        where pa.player_id = ${command.playerId} and pa.revoked_at is null and a.kind = 'account'
      `;

      if (account.length === 0)
        return yield* new Rejected({
          reason: "invalid",
          message: "Only a player with an account can record for everyone.",
        });
    }

    const visits =
      command.type === "delete_table"
        ? yield* sql`
            select * from personal_visits where table_id = ${table.id}
          `.pipe(Effect.flatMap(Access.decodeRows(PersonalVisitRow)))
        : [];

    return { ...ledger, participants, recorders, tables: [table], visits: visits.map(visitOf) };
  }

  if (command.type === "open_table") {
    const taken = yield* sql`select 1 from tables where id = ${command.tableId}`;

    if (taken.length > 0) return yield* new Rejected(sessionRecorded);

    return ledger;
  }

  if (command.type === "start" || command.type === "record_completed") {
    const taken = yield* sql`
      select 1 from personal_visits where id = ${command.visitId}
      union all select 1 from tables where id = ${command.tableId}
    `;

    if (taken.length > 0) return yield* new Rejected(sessionRecorded);

    return ledger;
  }

  if (command.type === "join_table") {
    const { table, participants, recorders } = yield* lockTable(command.tableId, actorPlayers);
    const taken = yield* sql`select 1 from personal_visits where id = ${command.visitId}`;

    if (taken.length > 0) return yield* new Rejected(sessionRecorded);

    const visits = yield* sql`select * from personal_visits where table_id = ${table.id}`.pipe(
      Effect.flatMap(Access.decodeRows(PersonalVisitRow)),
    );

    let players = ledger.players;

    if (command.newPlayer) {
      const used = yield* sql`select 1 from players where id = ${command.newPlayer.id}`;

      if (used.length > 0) return yield* new Rejected(playerRecorded);
    } else if (command.playerId !== self.playerId) {
      const saved = yield* sql`
        select id, display_name from players
        where id = ${command.playerId}
          and (created_by_actor = ${self.actorId}
            or id in (select player_id from player_actors
              where actor_id = ${self.actorId} and revoked_at is null)
            or id in (select player_id from ${tablePlayers(sql)} t where table_id = ${table.id})
            or id in (select player_id from personal_visits where table_id = ${table.id}))
      `.pipe(Effect.flatMap(Access.decodeRows(PlayerIdentityRow)));

      players = [...players, ...saved.map((row) => PlayerIdentity.make(row))];
    }

    return {
      ...ledger,
      players,
      participants,
      recorders,
      tables: [table],
      visits: visits.map(visitOf),
    };
  }

  const [located] = yield* sql<{ tableId: TableId }>`
    select table_id from personal_visits where id = ${command.visitId}
  `;

  if (!located) return yield* new Rejected({ reason: "invalid", message: "Visit does not exist." });
  const { table, participants, recorders } = yield* lockTable(located.tableId, actorPlayers);
  yield* sql`select 1 from personal_visits where id = ${command.visitId} for update`;

  const visits = yield* sql`select * from personal_visits where table_id = ${table.id}`.pipe(
    Effect.flatMap(Access.decodeRows(PersonalVisitRow)),
  );

  const entries = yield* sql`
    select * from personal_entries where visit_id = ${command.visitId}
  `.pipe(Effect.flatMap(Access.decodeRows(PersonalEntryRow)));

  const operations = yield* sql`
    select actor_id, command from personal_operations
    where visit_id = ${command.visitId} and id <> ${command.operationId}
    order by seq
  `.pipe(Effect.flatMap(Access.decodeRows(PersonalOperationRow)));

  return {
    ...ledger,
    participants,
    recorders,
    tables: [table],
    visits: visits.map(visitOf),
    entries: entries.map(entryOf),
    receipts: operations.map((row, index) => ({ command: row.command, revision: index + 2 })),
  };
});

const save = Effect.fn("Recording.save")(function* (
  self: Identity,
  before: RecordingLedger,
  after: RecordingLedger,
  command: RecordingCommand,
) {
  const sql = yield* SqlClient.SqlClient;

  if (isTableCommand(command)) {
    if (command.type === "set_table_trip")
      yield* sql`update tables set trip_id = ${command.tripId} where id = ${command.tableId}`;

    if (command.type === "delete_table")
      yield* sql`
        update tables set deleted_at = ${date(command.preparedAt)}, trip_id = null
        where id = ${command.tableId}
      `;
    yield* sql`
      insert into personal_operations (id, player_id, visit_id, table_id, actor_id, command)
      values (${command.operationId}, ${self.playerId}, null, ${command.tableId},
        ${self.actorId}, ${commandText(command)}::jsonb)
    `;

    return;
  }

  for (const table of after.tables.filter(
    (table) => !before.tables.some((item) => item.id === table.id),
  )) {
    yield* sql`
      insert into tables (id, starter_player_id, game, game_name, venue_id, high_limit)
      values (${table.id}, ${table.starterPlayerId}, ${table.game}, ${table.gameName ?? null},
        ${table.venueId}, ${table.highLimit})
    `;
  }

  if (command.type === "open_table") {
    yield* sql`
      insert into personal_operations (id, player_id, visit_id, table_id, actor_id, command)
      values (${command.operationId}, ${self.playerId}, null, ${command.tableId},
        ${self.actorId}, ${commandText(command)}::jsonb)
    `;

    return;
  }

  for (const table of after.tables) {
    const previous = before.tables.find((item) => item.id === table.id);

    if (previous && previous !== table)
      yield* sql`
        update tables
        set game = ${table.game}, game_name = ${table.gameName ?? null},
          venue_id = ${table.venueId}, high_limit = ${table.highLimit}
        where id = ${table.id}
      `;
  }

  for (const player of after.players.filter((player) => !before.players.includes(player))) {
    yield* sql`
      insert into players (id, display_name, created_by_actor)
      values (${player.id}, ${player.displayName}, ${self.actorId})
    `;
  }

  const visit = after.visits.find((visit) => visit.id === command.visitId)!;

  if (!before.visits.some((item) => item.id === visit.id)) {
    yield* sql`
      insert into personal_visits (id, player_id, table_id, started_at, finished_at, revision)
      values (
        ${visit.id}, ${visit.playerId}, ${visit.tableId}, ${date(visit.startedAt)},
        ${visit.finishedAt ? date(visit.finishedAt) : null}, ${visit.revision}
      )
    `;
  } else {
    yield* sql`
      update personal_visits
      set started_at = ${date(visit.startedAt)},
        finished_at = ${visit.finishedAt ? date(visit.finishedAt) : null},
        deleted_at = ${visit.deletedAt ? date(visit.deletedAt) : null},
        revision = ${visit.revision}
      where id = ${visit.id}
    `;
  }

  const known = new Map(before.entries.map((entry) => [entry.id, entry]));

  for (const entry of after.entries) {
    const previous = known.get(entry.id);

    if (!previous) {
      yield* sql`
        insert into personal_entries (
          id, visit_id, kind, amount, occurred_at, note, created_by, created_at,
          voided_at, voided_by, void_reason, replaces_entry_id, counterparty_id
        ) values (
          ${entry.id}, ${entry.visitId}, ${entry.kind}, ${BigInt(entry.amount)},
          ${date(entry.occurredAt)}, ${entry.note}, ${entry.createdBy}, ${date(entry.createdAt)},
          ${entry.voidedAt ? date(entry.voidedAt) : null}, ${entry.voidedBy}, ${entry.voidReason},
          ${entry.replacesEntryId}, ${entry.counterpartyId}
        )
      `;
    } else if (previous !== entry) {
      yield* sql`
        update personal_entries
        set voided_at = ${entry.voidedAt ? date(entry.voidedAt) : null}, voided_by = ${entry.voidedBy},
          void_reason = ${entry.voidReason}
        where id = ${entry.id}
      `;
    }
  }

  yield* sql`
    insert into personal_operations (id, player_id, visit_id, table_id, actor_id, command)
    values (${command.operationId}, ${self.playerId}, ${command.visitId}, ${visit.tableId},
      ${self.actorId}, ${commandText(command)}::jsonb)
  `;
});

const uniqueViolation = (constraint: string) =>
  constraint.startsWith("personal_entries")
    ? entryRecorded
    : constraint.startsWith("players")
      ? playerRecorded
      : constraint === "personal_visits_one_open"
        ? { reason: "invalid" as const, message: "This player is already playing at this table." }
        : sessionRecorded;

const atTable = (ledger: RecordingLedger, command: RecordingCommand) => {
  const named =
    command.type === "join_table" || command.type === "add" || command.type === "finish"
      ? command.counterpartyId
      : command.type === "correct"
        ? command.replacement?.counterpartyId
        : undefined;

  if (named === undefined) return true;

  const tableId =
    command.type === "join_table"
      ? command.tableId
      : ledger.visits.find((visit) => "visitId" in command && visit.id === command.visitId)
          ?.tableId;

  const table = ledger.tables.find((table) => table.id === tableId);

  if (!table) return true;

  return (
    table.starterPlayerId === named ||
    ledger.visits.some((visit) => visit.tableId === table.id && visit.playerId === named) ||
    ledger.participants.some((item) => item.tableId === table.id && item.playerId === named)
  );
};

const applyOne = Effect.fn("Recording.applyOne")(function* (
  self: Identity,
  actorPlayers: ReadonlyArray<PlayerId>,
  command: RecordingCommand,
) {
  const sql = yield* SqlClient.SqlClient;

  const replayed = Effect.gen(function* () {
    const [existing] = yield* sql`
      select actor_id, command from personal_operations where id = ${command.operationId}
    `.pipe(Effect.flatMap(Access.decodeRows(PersonalOperationRow)));

    if (!existing) return false;

    if (existing.actorId === self.actorId && commandText(existing.command) === commandText(command))
      return true;

    return yield* new Rejected({
      reason: "operation_reused",
      message: "This operation ID was already saved with different content.",
    });
  });

  const apply = Effect.gen(function* () {
    if (yield* replayed) return;
    const before = yield* loadLedger(self, actorPlayers, command);

    if (yield* replayed) return;
    const created = createdEntryIds(command);

    if (created.length > 0) {
      const taken = yield* sql`select 1 from personal_entries where id in ${sql.in(created)}`;

      if (taken.length > 0) return yield* new Rejected(entryRecorded);
    }

    if (!atTable(before, command)) return yield* new Rejected(notAtTable);

    const after = yield* Effect.try({
      try: () => applyRecordingCommand(before, command, actorPlayers),
      catch: (error) => error,
    }).pipe(
      Effect.catch((error) =>
        error instanceof RecordingError &&
        (error.reason === "invalid" || error.reason === "conflict" || error.reason === "forbidden")
          ? Effect.fail(new Rejected({ reason: error.reason, message: error.message }))
          : Effect.die(error),
      ),
    );

    const venueId =
      command.type === "start" ||
      command.type === "record_completed" ||
      command.type === "open_table"
        ? command.venueId
        : command.type === "edit_visit"
          ? command.table?.venueId
          : null;

    if (venueId)
      yield* Venues.getPublic(venueId).pipe(
        Effect.catchTag("NotFound", () =>
          Effect.fail(
            new Rejected({
              reason: "invalid",
              message: "Choose a public venue or leave the venue empty.",
            }),
          ),
        ),
      );
    yield* save(self, before, after, command);
    const [table] = before.tables;

    if (!table) return;

    if (command.type === "set_table_trip" && command.tripId === table.tripId) return;

    if (command.type === "delete_table") {
      yield* Realtime.closed({
        scope: tableScope(table.id),
        selector: { kind: "all" },
        code: ScopeCloseCode.tableDeleted,
      });
    }

    if (command.type === "set_table_trip") {
      const [from, to] = [yield* groupOfTrip(table.tripId), yield* groupOfTrip(command.tripId)];

      if (from !== null && from !== to) {
        yield* Realtime.closed({
          scope: tableScope(table.id),
          selector: { kind: "group", groupId: from },
          code: ScopeCloseCode.revoked,
        });
      }
    }

    yield* tableChanged(
      table.id,
      command.type === "set_table_trip"
        ? [table.tripId, command.tripId]
        : command.type === "appoint_recorder" || command.type === "revoke_recorder"
          ? []
          : [table.tripId],
    );
  });

  return yield* Realtime.transaction(apply).pipe(
    Effect.catchReason("SqlError", "UniqueViolation", (reason) =>
      reason.constraint === "personal_operations_pkey"
        ? Effect.flatMap(replayed, (same) =>
            same ? Effect.void : Effect.fail(new Rejected(sessionRecorded)),
          )
        : Effect.fail(new Rejected(uniqueViolation(reason.constraint))),
    ),
    Effect.map(
      () =>
        ({
          operationId: command.operationId,
          status: "accepted",
        }) satisfies RecordingCommandResult,
    ),
    Effect.catchTag("Rejected", (rejected) =>
      Effect.succeed<RecordingCommandResult>({
        operationId: command.operationId,
        status: "rejected",
        reason: rejected.reason,
        message: rejected.message,
      }),
    ),
  );
});

/**
 * The recorder as `identity` claims it. An account's first write establishes its recording
 * identity; a device with a different one must pull and adopt it first. A device actor's first
 * write creates the player it records as.
 */
export const establish = Effect.fn("Recording.establish")(function* (
  identity: RecordingIdentityType,
) {
  const sql = yield* SqlClient.SqlClient;
  const recorder = yield* Recorder;
  const { playerId, actorId } = identity;

  if (Predicate.isTagged(recorder, "Account")) {
    const user = recorder.user;

    const establish = Effect.gen(function* () {
      yield* Access.ensureUser().pipe(Effect.provideService(CurrentUser, user));
      yield* sql`
        insert into recording_actors (id, kind) values (${actorId}, 'account') on conflict do nothing
      `;

      const [actor] = yield* sql<{ kind: string }>`
        select kind from recording_actors where id = ${actorId}
      `;

      if (actor?.kind !== "account") return yield* new Conflict({ reason: "recording_identity" });
      yield* sql`
        insert into players (id, group_id, display_name, user_id, created_by, recording_actor_id)
        values (${playerId}, null, ${user.displayName.slice(0, 60) || "You"},
          ${user.userId}, ${user.userId}, ${actorId})
        on conflict do nothing
      `;
      yield* sql`
        insert into player_actors (player_id, actor_id)
        select id, recording_actor_id from players
        where user_id = ${user.userId} and recording_actor_id is not null
        on conflict do nothing
      `;
    });

    yield* sql.withTransaction(establish).pipe(
      Effect.catchReasons("SqlError", {
        UniqueViolation: () => Effect.fail(new Conflict({ reason: "recording_identity" })),
        ConstraintError: () => Effect.fail(new Conflict({ reason: "recording_identity" })),
      }),
    );
  } else {
    const verified = yield* verifiedActor(recorder.actorId, recorder.secret);

    if (verified !== actorId) return yield* new Conflict({ reason: "recording_identity" });

    const created = yield* sql`
      insert into players (id, display_name, created_by_actor)
      values (${playerId}, 'Starter', ${actorId})
      on conflict do nothing
      returning id
    `;

    if (created.length > 0)
      yield* sql`insert into player_actors (player_id, actor_id) values (${playerId}, ${actorId})`;
  }

  const established = yield* principal();
  const self = established.self;

  if (!self || self.playerId !== playerId || self.actorId !== actorId)
    return yield* new Conflict({ reason: "recording_identity" });

  return { self, actorPlayers: established.actorPlayers };
});

/** Applies commands in order with the same rules the device used. */
export const push = Effect.fn("Recording.push")(function* (request: PushRecordingRequest) {
  const { self, actorPlayers } = yield* establish(request.identity);

  const results = yield* Effect.forEach(request.commands, (command) =>
    applyOne(self, actorPlayers, command),
  );

  return { results };
});

export const history = Effect.fn("Recording.history")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const { self, actorPlayers } = yield* principal();

  if (!self || actorPlayers.length === 0)
    return {
      identity: null,
      ownedPlayerIds: [],
      commands: [],
      tables: [],
      participants: [],
      players: [],
      visits: [],
      entries: [],
    };
  const mine = sql.in(actorPlayers);

  const whole = sql`(
    select id from tables where starter_player_id in ${mine}
    union select table_id from ${tableRecorders(sql)} r where player_id in ${mine}
  )`;

  const at = sql`(select table_id from ${tablePlayers(sql)} t where player_id in ${mine})`;

  const visible = sql`(
    select id from personal_visits
    where table_id in ${whole} or player_id in ${mine}
      or (table_id in ${at} and id in (
        select visit_id from personal_operations where actor_id = ${self.actorId}))
  )`;

  const tables = yield* sql`
    select * from tables where id in ${whole} or id in ${at} order by id
  `.pipe(Effect.flatMap(Access.decodeRows(TableRow)));

  const participants = yield* sql`
    select t.table_id, p.id, p.display_name
    from ${tablePlayers(sql)} t join players p on p.id = t.player_id
    where t.player_id in ${mine}
      or (t.table_id in ${whole} and (
        t.table_id not in (select id from tables where starter_player_id in ${mine})
        or (t.table_id, t.player_id) in (select table_id, player_id from table_participants)))
    order by t.table_id, p.id
  `.pipe(Effect.flatMap(Access.decodeRows(ParticipantRow)));

  const visits = yield* sql`
    select * from personal_visits where id in ${visible} order by started_at, id
  `.pipe(Effect.flatMap(Access.decodeRows(PersonalVisitRow)));

  const known = new Set<string>([self.playerId, ...participants.map((row) => row.id)]);

  const players = yield* sql`
    select id, display_name from players
    where id in (select player_id from personal_visits where id in ${visible})
      or id in (select counterparty_id from personal_entries where visit_id in ${visible})
    order by id
  `.pipe(
    Effect.flatMap(Access.decodeRows(PlayerIdentityRow)),
    Effect.map((rows) => rows.filter((row) => !known.has(row.id))),
  );

  const entries = yield* sql`
    select * from personal_entries where visit_id in ${visible} order by created_at, id
  `.pipe(Effect.flatMap(Access.decodeRows(PersonalEntryRow)));

  const operations = yield* sql`
    select actor_id, command from personal_operations
    where table_id in ${whole} or visit_id in ${visible}
    order by seq
  `.pipe(Effect.flatMap(Access.decodeRows(PersonalOperationRow)));

  return {
    identity: { playerId: self.playerId, actorId: self.actorId },
    ownedPlayerIds: actorPlayers,
    commands: operations.map((row) => row.command),
    tables: tables.map((row) => tableOf(row, row.starterPlayerId!)),
    participants: participants.map(({ tableId, ...player }) => ({
      tableId,
      player: PlayerIdentity.make(player),
    })),
    players: players.map((player) => PlayerIdentity.make(player)),
    visits: visits.map(visitOf),
    entries: entries.map(entryOf),
  };
});

const viewOf = Effect.fn("Recording.viewOf")(function* (
  row: typeof TableRow.Type,
  viewerRole: TableView["viewerRole"],
  viewerPlayerId: PlayerId | null,
  includeEntries = false,
) {
  const sql = yield* SqlClient.SqlClient;

  const visits = yield* sql`
    select * from personal_visits where table_id = ${row.id} order by started_at, id
  `.pipe(Effect.flatMap(Access.decodeRows(PersonalVisitRow)));

  if (
    row.deletedAt !== null ||
    (visits.length > 0 && visits.every((visit) => visit.deletedAt !== null))
  )
    return yield* new NotFound({ resource: "table" });

  const players = yield* sql`
    select id, display_name from players
    where id in (select player_id from personal_visits where table_id = ${row.id})
      or id in (select player_id from table_participants where table_id = ${row.id})
    order by display_name, id
  `.pipe(Effect.flatMap(Access.decodeRows(PlayerIdentityRow)));

  const recorders = yield* recordersAt(row.id);

  const appointable =
    viewerRole === "starter"
      ? yield* sql<{ playerId: PlayerId }>`
          select distinct t.player_id from ${tablePlayers(sql)} t
          join player_actors pa on pa.player_id = t.player_id and pa.revoked_at is null
          join recording_actors a on a.id = pa.actor_id and a.kind = 'account'
          where t.table_id = ${row.id}
        `.pipe(Effect.map((rows) => rows.map((item) => item.playerId)))
      : [];

  const entries = yield* sql`
    select e.* from personal_entries e join personal_visits v on v.id = e.visit_id
    where v.table_id = ${row.id}
  `.pipe(Effect.flatMap(Access.decodeRows(PersonalEntryRow)));

  const played = entries.map(entryOf);

  const base = {
    table: { ...tableFields(row), starterPlayerId: row.starterPlayerId },
    players: players.map((player) => PlayerIdentity.make(player)),
    visits: visits.flatMap((visit) =>
      visit.deletedAt === null ? [visitSummary(visitOf(visit), played)] : [],
    ),
    viewerRole,
    viewerPlayerId,
    recorders: recorders.map((item) => item.playerId),
    appointable,
    shared: viewerRole === "starter" && row.shareTokenHash !== null,
  };

  const withEntries = includeEntries ? { ...base, entries: played } : base;

  const view = (
    row.legacySessionId === null
      ? withEntries
      : { ...withEntries, legacySessionId: row.legacySessionId }
  ) satisfies TableView;

  return view;
});

const tripMember = Effect.fn("Recording.tripMember")(function* (tripId: TripId | null) {
  const recorder = yield* Recorder;

  if (tripId === null || !Predicate.isTagged(recorder, "Account")) return false;
  const sql = yield* SqlClient.SqlClient;

  const rows = yield* sql`
    select 1 from trips t join memberships m on m.group_id = t.group_id
    where t.id = ${tripId} and m.user_id = ${recorder.user.userId} and m.left_at is null
  `;

  return rows.length > 0;
});

const tableAccess = Effect.fn("Recording.tableAccess")(function* (tableId: TableId) {
  const sql = yield* SqlClient.SqlClient;
  const { actorPlayers } = yield* principal();

  const [row] = yield* sql`select * from tables where id = ${tableId}`.pipe(
    Effect.flatMap(Access.decodeRows(TableRow)),
  );

  if (!row?.starterPlayerId || row.deletedAt !== null)
    return yield* new NotFound({ resource: "table" });
  const at = { ...row, starterPlayerId: row.starterPlayerId };

  if (actorPlayers.includes(row.starterPlayerId))
    return { row: at, role: "starter" as const, playerId: row.starterPlayerId };

  const recorder = (yield* recordersAt(row.id)).find((item) =>
    actorPlayers.includes(item.playerId),
  );

  const joined = (yield* participantsAt(row.id)).find((item) =>
    actorPlayers.includes(item.playerId),
  );

  const player = recorder ?? joined;

  if (!player) {
    if (yield* tripMember(row.tripId)) return { row: at, role: "viewer" as const, playerId: null };

    return yield* new NotFound({ resource: "table" });
  }

  return {
    row: at,
    role: recorder ? ("recorder" as const) : ("participant" as const),
    playerId: player.playerId,
  };
});

const startedTable = Effect.fn("Recording.startedTable")(function* (tableId: TableId) {
  const access = yield* tableAccess(tableId);

  if (access.role !== "starter") return yield* new Forbidden({ reason: "starter_only" });

  return access.row;
});

export const table = Effect.fn("Recording.table")(function* (tableId: TableId) {
  const sql = yield* SqlClient.SqlClient;

  const [legacy] = yield* sql`
    select t.*, s.trip_id from tables t join sessions s on s.id = t.legacy_session_id
    where t.id = ${tableId} and t.deleted_at is null
  `.pipe(Effect.flatMap(Access.decodeRows(TableRow)));

  if (legacy) {
    if (!(yield* tripMember(legacy.tripId))) return yield* new NotFound({ resource: "table" });

    return yield* viewOf(legacy, "viewer", null, true);
  }

  const { row, role, playerId } = yield* tableAccess(tableId);

  return yield* viewOf(row, role, playerId, yield* tripMember(row.tripId));
});

const linkClosed = Effect.fn("Recording.linkClosed")(function* (
  tableId: TableId,
  shareHash: string | null,
) {
  if (shareHash === null) return;

  yield* Realtime.closed({
    scope: tableScope(tableId),
    selector: { kind: "share", shareHash },
    code: ScopeCloseCode.revoked,
  });
});

/** A new read-only link. Only its hash is kept, so an earlier link stops working. */
export const share = Effect.fn("Recording.share")(function* (tableId: TableId) {
  const sql = yield* SqlClient.SqlClient;
  const row = yield* startedTable(tableId);
  const token = randomToken();

  const [replaced] = yield* sql<{ shareHash: string | null }>`
    update tables set share_token_hash = ${yield* digest(token)}
    from (select share_token_hash as before from tables where id = ${row.id}) old
    where id = ${row.id}
    returning old.before as share_hash
  `;

  yield* Realtime.changed(tableScope(row.id));
  yield* linkClosed(row.id, replaced?.shareHash ?? null);

  return { token };
});

export const unshare = Effect.fn("Recording.unshare")(function* (tableId: TableId) {
  const sql = yield* SqlClient.SqlClient;
  const row = yield* startedTable(tableId);

  const [unshared] = yield* sql<{ shareHash: string | null }>`
    update tables set share_token_hash = null
    from (select share_token_hash as before from tables where id = ${row.id}) old
    where id = ${row.id} and old.before is not null
    returning old.before as share_hash
  `;

  if (!unshared) return;
  yield* Realtime.changed(tableScope(row.id));
  yield* linkClosed(row.id, unshared.shareHash);
});

/** The one table a share link names, read-only, for anyone holding the link. */
export const shared = Effect.fn("Recording.shared")(function* (token: string) {
  const sql = yield* SqlClient.SqlClient;

  const [row] = yield* sql`
    select * from tables where share_token_hash = ${yield* digest(token)}
  `.pipe(Effect.flatMap(Access.decodeRows(TableRow)));

  if (!row?.starterPlayerId) return yield* new NotFound({ resource: "table" });

  return yield* viewOf({ ...row, starterPlayerId: row.starterPlayerId }, "viewer", null);
});

/**
 * Joins the table a share link names as a new player bound to the recorder, who then records that
 * player's play through push. The player's ID must be unused, so joining can never take over
 * someone already recorded. Joining again returns the player this recorder joined as.
 */
export const join = Effect.fn("Recording.join")(function* (
  token: string,
  request: JoinTableRequest,
) {
  const sql = yield* SqlClient.SqlClient;
  const hash = yield* digest(token);
  const linked = yield* sql`select 1 from tables where share_token_hash = ${hash} and ${open(sql)}`;

  if (linked.length === 0) return yield* new NotFound({ resource: "table" });
  const { self, actorPlayers } = yield* establish(request.identity);

  const attempt = Effect.gen(function* () {
    const [row] = yield* sql`
      select * from tables where share_token_hash = ${hash} and ${open(sql)} for update
    `.pipe(Effect.flatMap(Access.decodeRows(TableRow)));

    if (!row?.starterPlayerId) return yield* new NotFound({ resource: "table" });
    const table = tableOf(row, row.starterPlayerId);

    if (actorPlayers.includes(table.starterPlayerId))
      return yield* new Conflict({ reason: "table_starter" });

    const [existing] = yield* sql`
      select p.id, p.display_name
      from table_participants tp
      join player_actors pa on pa.player_id = tp.player_id and pa.revoked_at is null
      join players p on p.id = tp.player_id
      where tp.table_id = ${table.id} and pa.actor_id = ${self.actorId}
    `.pipe(Effect.flatMap(Access.decodeRows(PlayerIdentityRow)));

    if (existing) return { table, player: PlayerIdentity.make(existing) };
    const { id, displayName } = request.player;
    const recorder = yield* Recorder;
    const accountUserId = Predicate.isTagged(recorder, "Account") ? recorder.user.userId : null;

    const created = yield* sql`
      insert into players (id, display_name, created_by_actor, user_id)
      values (${id}, ${displayName}, ${self.actorId},
        ${accountUserId})
      on conflict do nothing
      returning id
    `;

    if (created.length === 0) return yield* new Conflict({ reason: "id_taken" });
    yield* sql`
      insert into player_actors (player_id, actor_id, bound_via)
      values (${id}, ${self.actorId}, 'join')
    `;
    yield* sql`
      insert into table_participants (table_id, player_id, joined_via)
      values (${table.id}, ${id}, 'link')
    `;
    yield* Realtime.changed(tableScope(table.id));
    const joined: JoinedTable = { table, player: PlayerIdentity.make({ id, displayName }) };

    return joined;
  });

  return yield* Realtime.transaction(attempt).pipe(
    Effect.catchReason("SqlError", "UniqueViolation", () =>
      Effect.fail(new Conflict({ reason: "id_taken" })),
    ),
  );
});

/** Registers a device actor. Registering again with the same secret changes nothing. */
export const registerActor = Effect.fn("Recording.registerActor")(function* (
  credential: ActorCredential,
) {
  const sql = yield* SqlClient.SqlClient;
  const hash = yield* digest(credential.secret);
  yield* sql`
    insert into recording_actors (id, kind, secret_hash)
    values (${credential.actorId}, 'device', ${hash})
    on conflict do nothing
  `;

  const [row] = yield* sql<{ secretHash: string | null }>`
    select secret_hash from recording_actors where id = ${credential.actorId} and kind = 'device'
  `;

  if (row?.secretHash !== hash) return yield* new Conflict({ reason: "actor_taken" });
});

/** The most devices, besides an actor's own, that may record as one player at once. */
export const MAX_DEVICES = 5;

interface HeldPlayer {
  readonly id: PlayerId;
  readonly displayName: string;
  readonly userId: string | null;
  readonly boundVia: "self" | "join" | "invite";
}

/**
 * Takes what a signed-out device holds for the signed-in account, once the device proves its
 * secret. Claiming links players to the account; it never copies an entry, visit or payment.
 *
 * - An account without a personal player takes the device's own player as it, and the actor
 *   becomes the account's: the account records as it from now on.
 * - An account that already has one can't take a second as its personal player. The two stay
 *   different people, and nothing is claimed until `link` asks for it: then the device's own
 *   player is linked beside the personal one, and the device keeps its actor and secret.
 * - Every other player the device is bound to (it joined a table as them, or redeemed an invite
 *   for them) is claimed too, unless another account has them. Each claimed player is bound to
 *   the account's actor, so authority over it, a starter's included, follows the account to any
 *   device it signs in on.
 *
 * A revoked binding claims nothing. A legacy group guest is never held this way.
 */
export const claimActor = Effect.fn("Recording.claimActor")(function* (request: ClaimActorRequest) {
  const sql = yield* SqlClient.SqlClient;
  const user = yield* CurrentUser;
  const name = user.displayName.slice(0, 60) || "You";

  const claim = Effect.gen(function* () {
    const none = { adopted: false, claimed: [], refused: [] } satisfies ClaimResult;

    const [device] = yield* sql<{ secretHash: string }>`
      select secret_hash from recording_actors where id = ${request.actorId} and kind = 'device'
    `;

    if (!device) return none;

    if (device.secretHash !== (yield* digest(request.secret))) return yield* new Unauthorized();
    yield* Access.ensureUser();
    const own = yield* personalIdentity(user.userId);

    const heldBy = sql<HeldPlayer>`
      select p.id, p.display_name, p.user_id, pa.bound_via
      from player_actors pa join players p on p.id = pa.player_id
      where pa.actor_id = ${request.actorId} and pa.revoked_at is null and p.group_id is null
      order by p.id
    `;

    const lockPlayers = (players: ReadonlyArray<HeldPlayer>) =>
      players.length === 0
        ? Effect.void
        : sql`
            select 1 from players where id in ${sql.in(players.map(({ id }) => id))}
            order by id for update
          `;

    const candidates = yield* heldBy;
    yield* lockPlayers(candidates);

    const [actor] = yield* sql`
      select 1 from recording_actors where id = ${request.actorId} and kind = 'device' for update
    `;

    if (!actor) return none;
    let held = yield* heldBy;
    const unlocked = held.filter((player) => !candidates.some(({ id }) => id === player.id));

    if (unlocked.length > 0) {
      yield* lockPlayers(unlocked);
      held = yield* heldBy;
    }

    const self = held.find((player) => player.boundVia === "self");

    if (self && self.userId !== null && self.userId !== user.userId)
      return yield* new Conflict({ reason: "player_claimed" });
    const separate = self !== undefined && own !== null;

    if (separate && self.userId === null && request.link !== true)
      return yield* new Conflict({ reason: "recording_identity" });
    const taken = held.filter((player) => player.userId !== null && player.userId !== user.userId);
    const fresh = held.filter((player) => player.userId === null);
    const identity = ({ id, displayName }: HeldPlayer) => ({ id, displayName });

    if (separate) {
      const linked: HeldPlayer[] = [];
      const changed: HeldPlayer[] = [];

      for (const player of held.filter((player) => !taken.includes(player))) {
        const [binding] = yield* sql<{ revokedAt: Date | null }>`
          select revoked_at from player_actors
          where player_id = ${player.id} and actor_id = ${own.actorId}
        `;

        if (binding?.revokedAt) continue;

        if (!binding) {
          const [bound] = yield* sql<{ count: number }>`
            select count(*)::int as count from player_actors
            where player_id = ${player.id} and bound_via <> 'self' and revoked_at is null
              and actor_id <> ${own.actorId}
          `;

          if ((bound?.count ?? 0) >= MAX_DEVICES) continue;
          yield* sql`
            insert into player_actors (player_id, actor_id, bound_via, invited_by_actor)
            values (${player.id}, ${own.actorId},
              ${player.boundVia === "self" ? "invite" : player.boundVia}, ${request.actorId})
          `;
          changed.push(player);
        }

        const claimed = yield* sql`
          update players set user_id = ${user.userId}
          where id = ${player.id} and user_id is distinct from ${user.userId}
          returning id
        `;

        if (claimed.length > 0 && !changed.includes(player)) changed.push(player);
        linked.push(player);
      }

      yield* playersChanged(changed.map(({ id }) => id));

      return {
        adopted: false,
        claimed: fresh.filter((player) => linked.includes(player)).map(identity),
        refused: taken.map(identity),
      } satisfies ClaimResult;
    }

    yield* sql`
      update recording_actors set kind = 'account', secret_hash = null
      where id = ${request.actorId}
    `;

    if (taken.length > 0)
      yield* sql`
        update player_actors set revoked_at = now()
        where actor_id = ${request.actorId} and player_id in ${sql.in(taken.map(({ id }) => id))}
      `;

    if (self?.userId === null)
      yield* sql`
        update players
        set user_id = ${user.userId}, recording_actor_id = ${request.actorId}, display_name = ${name}
        where id = ${self.id}
      `;
    const others = fresh.filter((player) => player.boundVia !== "self");

    if (others.length > 0)
      yield* sql`
        update players set user_id = ${user.userId} where id in ${sql.in(others.map(({ id }) => id))}
      `;

    yield* playersChanged(held.map(({ id }) => id));

    return {
      adopted: self?.userId === null,
      claimed: fresh.map((player) =>
        player === self ? { id: player.id, displayName: name } : identity(player),
      ),
      refused: taken.map(identity),
    } satisfies ClaimResult;
  });

  return yield* Realtime.transaction(claim).pipe(
    Effect.catchReason("SqlError", "UniqueViolation", () =>
      Effect.fail(new Conflict({ reason: "recording_identity" })),
    ),
  );
});
