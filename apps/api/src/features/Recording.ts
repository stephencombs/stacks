import * as Data from "effect/Data";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import {
  ActorId,
  Conflict,
  CurrentUser,
  Forbidden,
  NotFound,
  PlayEntry,
  PlayerIdentity,
  Recorder,
  Repayment,
  Table,
  Unauthorized,
  Visit,
  type PlayerId,
  type TableId,
} from "@stacks/contracts";
import {
  isPairCommand,
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
  createdRepaymentIds,
  pairOf,
  RecordingError,
  type Participant,
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
  RepaymentRow,
  TableRow,
} from "../db/rows.ts";
import * as Access from "./Access.ts";

class Rejected extends Data.TaggedError("Rejected")<{
  readonly reason: RecordingRejectionReason;
  readonly message: string;
}> {}

type Identity = typeof RecordingIdentityRow.Type;

/** Who is recording: the player and actor they record as, and every player bound to the actor. */
interface Principal {
  readonly self: Identity | null;
  readonly actorPlayers: ReadonlyArray<PlayerId>;
}

// Reused IDs are a conflict: when they hold the same facts (a restored backup, another device's
// copy), the device's next pull finds them and settles the refusal instead of recording again.
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

/** The device actor whose secret the request proved, or a 401. */
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

/**
 * Who is at each table, as `(table_id, player_id)`: who joined through its link, and the players
 * bound to an actor through a personal invite, at the tables where they play.
 */
const tablePlayers = (sql: SqlClient.SqlClient) => sql`(
  select table_id, player_id from table_participants
  union
  select v.table_id, v.player_id from personal_visits v
  where exists (
    select 1 from player_actors pa
    where pa.player_id = v.player_id and pa.bound_via = 'invite' and pa.revoked_at is null
  )
)`;

/** Who records for everyone at each table, as `(table_id, player_id)`: the latest word wins. */
const tableRecorders = (sql: SqlClient.SqlClient) => sql`(
  select table_id, player_id from (
    select distinct on (table_id, command ->> 'playerId')
      table_id, (command ->> 'playerId')::uuid as player_id, command ->> 'type' as type
    from personal_operations where visit_id is null and table_id is not null
    order by table_id, command ->> 'playerId', seq desc
  ) latest where type = 'appoint_recorder'
)`;

/**
 * Who has been at each table, as `(table_id, player_id)`: its starter, everyone with a visit there
 * and everyone who joined it. Imported history is left out.
 */
const atTables = (sql: SqlClient.SqlClient) => sql`(
  select id as table_id, starter_player_id as player_id from tables
  where starter_player_id is not null
  union select table_id, player_id from personal_visits where legacy_session_id is null
  union select table_id, player_id from table_participants
)`;

/**
 * The people each of `players` has shared a table with: the only ones they can record payments
 * with or see a balance for, so player IDs can't be used to find anyone else.
 */
export const sharedTablePlayers = Effect.fn("Recording.sharedTablePlayers")(function* (
  players: ReadonlyArray<PlayerId>,
) {
  const sql = yield* SqlClient.SqlClient;
  if (players.length === 0) return [];
  return yield* sql<{ playerId: PlayerId; id: PlayerId; displayName: string }>`
    select distinct a.player_id, p.id, p.display_name
    from ${atTables(sql)} a
    join ${atTables(sql)} b on b.table_id = a.table_id and b.player_id <> a.player_id
    join players p on p.id = b.player_id
    where a.player_id in ${sql.in(players)}
    order by p.display_name, p.id, a.player_id
  `;
});

const boundPlayers = Effect.fn("Recording.boundPlayers")(function* (actorId: string) {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql<{ playerId: PlayerId }>`
    select player_id from player_actors where actor_id = ${actorId} and revoked_at is null
  `.pipe(Effect.map((rows) => rows.map((row) => row.playerId)));
});

export const principal = Effect.fn("Recording.principal")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const recorder = yield* Recorder;
  if (recorder._tag === "Account") {
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

const tableOf = (row: typeof TableRow.Type, starterPlayerId: PlayerId) =>
  Table.make({
    id: row.id,
    tripId: null,
    game: row.game,
    venueId: row.venueId,
    highLimit: row.highLimit,
    starterPlayerId,
  });

const visitOf = (visit: typeof PersonalVisitRow.Type) =>
  Visit.make({
    id: visit.id,
    tableId: visit.tableId,
    playerId: visit.playerId,
    startedAt: visit.startedAt,
    finishedAt: visit.finishedAt,
    revision: visit.revision,
  });

export const entryOf = (entry: typeof PersonalEntryRow.Type) =>
  PlayEntry.make({ ...entry, currency: "USD" });

export const repaymentOf = (row: typeof RepaymentRow.Type) =>
  Repayment.make({ ...row, currency: "USD" });

const participantsAt = Effect.fn("Recording.participantsAt")(function* (tableId: TableId) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ playerId: PlayerId }>`
    select player_id from ${tablePlayers(sql)} t where table_id = ${tableId}
  `;
  return rows.map((row): Participant => ({ tableId, playerId: row.playerId }));
});

const recordersAt = Effect.fn("Recording.recordersAt")(function* (tableId: TableId) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ playerId: PlayerId }>`
    select player_id from ${tableRecorders(sql)} r where table_id = ${tableId}
  `;
  return rows.map((row): Participant => ({ tableId, playerId: row.playerId }));
});

/**
 * The table and who joined it, locked until the transaction ends. Every command locks the table
 * before any visit. Someone neither starting nor at the table is refused here; the rules decide
 * whose play a member may record.
 */
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

/** What a command needs to see, with its table and then its visit locked. */
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
    repayments: [],
    receipts: [],
  };
  if (isPairCommand(command)) {
    const [ends] =
      command.type === "repay"
        ? [command]
        : yield* sql`select * from repayments where id = ${command.repaymentId}`.pipe(
            Effect.flatMap(Access.decodeRows(RepaymentRow)),
          );
    if (!ends)
      return yield* new Rejected({ reason: "invalid", message: "Payment does not exist." });
    const { fromPlayerId, toPlayerId } = ends;
    if (fromPlayerId === toPlayerId)
      return yield* new Rejected({
        reason: "invalid",
        message: "A payment is between two different players.",
      });
    // Never a recorder on someone's behalf: the actor must hold one end of the payment.
    const mine = actorPlayers.includes(fromPlayerId)
      ? fromPlayerId
      : actorPlayers.includes(toPlayerId)
        ? toPlayerId
        : null;
    if (mine === null)
      return yield* new Rejected({
        reason: "forbidden",
        message: "Only the two players in a payment can record it.",
      });
    if (command.type === "repay") {
      const other = mine === fromPlayerId ? toPlayerId : fromPlayerId;
      const known = yield* sharedTablePlayers([mine]);
      if (!known.some((row) => row.id === other))
        return yield* new Rejected({
          reason: "forbidden",
          message: "Record payments only with players you've shared a table with.",
        });
    }
    const [first, second] =
      fromPlayerId < toPlayerId ? [fromPlayerId, toPlayerId] : [toPlayerId, fromPlayerId];
    // Each pair's payments are one stream: commands on it apply one at a time.
    yield* sql`select pg_advisory_xact_lock(hashtextextended(${`pair:${first}:${second}`}, 0))`;
    const repayments = yield* sql`
      select * from repayments
      where (from_player_id = ${first} and to_player_id = ${second})
        or (from_player_id = ${second} and to_player_id = ${first})
      order by created_at, id
    `.pipe(Effect.flatMap(Access.decodeRows(RepaymentRow)));
    const operations = yield* sql`
      select actor_id, command from personal_operations
      where pair_first_player_id = ${first} and pair_second_player_id = ${second}
        and id <> ${command.operationId}
      order by seq
    `.pipe(Effect.flatMap(Access.decodeRows(PersonalOperationRow)));
    return {
      ...ledger,
      repayments: repayments.map(repaymentOf),
      receipts: operations.map((row, index) => ({ command: row.command, revision: index + 2 })),
    };
  }
  if (isTableCommand(command)) {
    const { table, participants, recorders } = yield* lockTable(command.tableId, actorPlayers);
    // The rules refuse anyone else too; first, so they learn nothing about the player.
    if (!actorPlayers.includes(table.starterPlayerId))
      return yield* new Rejected({
        reason: "forbidden",
        message: "Only the player who started this table can do that.",
      });
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
    return { ...ledger, participants, recorders, tables: [table] };
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
      // Only players this actor added or holds, or who are at this table, can be chosen: never
      // someone found by name.
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
  if (isPairCommand(command)) {
    const known = new Map(before.repayments.map((repayment) => [repayment.id, repayment]));
    for (const repayment of after.repayments) {
      const previous = known.get(repayment.id);
      if (!previous) {
        yield* sql`
          insert into repayments (
            id, from_player_id, to_player_id, amount, occurred_at, note, created_by, created_at,
            replaces_entry_id
          ) values (
            ${repayment.id}, ${repayment.fromPlayerId}, ${repayment.toPlayerId},
            ${BigInt(repayment.amount)}, ${date(repayment.occurredAt)}, ${repayment.note},
            ${repayment.createdBy}, ${date(repayment.createdAt)}, ${repayment.replacesEntryId}
          )
        `;
      } else if (previous.voidedAt === null && repayment.voidedAt !== null) {
        yield* sql`
          update repayments
          set voided_at = ${date(repayment.voidedAt)}, voided_by = ${repayment.voidedBy},
            void_reason = ${repayment.voidReason}
          where id = ${repayment.id}
        `;
      }
    }
    const [first, second] = pairOf(after.repayments, command)!;
    yield* sql`
      insert into personal_operations (
        id, player_id, visit_id, table_id, pair_first_player_id, pair_second_player_id, actor_id,
        command
      ) values (
        ${command.operationId}, ${self.playerId}, null, null, ${first}, ${second},
        ${self.actorId}, ${commandText(command)}::jsonb
      )
    `;
    return;
  }
  if (isTableCommand(command)) {
    yield* sql`
      insert into personal_operations (id, player_id, visit_id, table_id, actor_id, command)
      values (${command.operationId}, ${self.playerId}, null, ${command.tableId},
        ${self.actorId}, ${commandText(command)}::jsonb)
    `;
    return;
  }
  for (const table of after.tables.filter((table) => !before.tables.includes(table))) {
    yield* sql`
      insert into tables (id, starter_player_id, game, venue_id, high_limit)
      values (${table.id}, ${table.starterPlayerId}, ${table.game}, ${table.venueId},
        ${table.highLimit})
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
      set finished_at = ${visit.finishedAt ? date(visit.finishedAt) : null},
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
    } else if (previous.voidedAt === null && entry.voidedAt !== null) {
      yield* sql`
        update personal_entries
        set voided_at = ${date(entry.voidedAt)}, voided_by = ${entry.voidedBy},
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
  constraint.startsWith("personal_entries") || constraint.startsWith("repayments")
    ? entryRecorded
    : constraint.startsWith("players")
      ? playerRecorded
      : constraint === "personal_visits_one_open"
        ? { reason: "invalid" as const, message: "This player is already playing at this table." }
        : sessionRecorded;

/** Whether the other player a command names for the money is at the same table. */
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

/** Applies one command in its own transaction; a rejection rolls back everything it touched. */
const applyOne = Effect.fn("Recording.applyOne")(function* (
  self: Identity,
  actorPlayers: ReadonlyArray<PlayerId>,
  command: RecordingCommand,
) {
  const sql = yield* SqlClient.SqlClient;
  // Whether this operation is already saved: the same content is a replay, any other a refusal.
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
    // A push of the same operation may have committed while this one waited for the lock.
    if (yield* replayed) return;
    const created = createdEntryIds(command);
    if (created.length > 0) {
      const taken = yield* sql`select 1 from personal_entries where id in ${sql.in(created)}`;
      if (taken.length > 0) return yield* new Rejected(entryRecorded);
    }
    const paid = createdRepaymentIds(command);
    if (paid.length > 0) {
      const taken = yield* sql`select 1 from repayments where id in ${sql.in(paid)}`;
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
    yield* save(self, before, after, command);
  });
  return yield* sql.withTransaction(apply).pipe(
    // A concurrent push can claim the same IDs between the check and the insert. When it saved
    // this very operation, this push is its replay.
    Effect.catch((error) =>
      error._tag === "SqlError" && error.reason._tag === "UniqueViolation"
        ? error.reason.constraint === "personal_operations_pkey"
          ? Effect.flatMap(replayed, (same) =>
              same ? Effect.void : Effect.fail(new Rejected(sessionRecorded)),
            )
          : Effect.fail(new Rejected(uniqueViolation(error.reason.constraint)))
        : Effect.fail(error),
    ),
    Effect.map((): RecordingCommandResult => ({
      operationId: command.operationId,
      status: "accepted",
    })),
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
  if (recorder._tag === "Account") {
    const user = recorder.user;
    const establish = Effect.gen(function* () {
      yield* Access.ensureUser().pipe(Effect.provideService(CurrentUser, user));
      // One actor namespace: an ID a device registered is never an account's. The players foreign
      // key enforces the same, so a race can't slip past this check.
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
    yield* sql
      .withTransaction(establish)
      .pipe(
        Effect.catchTag("SqlError", (error) =>
          error.reason._tag === "UniqueViolation" || error.reason._tag === "ConstraintError"
            ? Effect.fail<Conflict | typeof error>(new Conflict({ reason: "recording_identity" }))
            : Effect.fail<Conflict | typeof error>(error),
        ),
      );
  } else {
    const verified = yield* verifiedActor(recorder.actorId, recorder.secret);
    if (verified !== actorId) return yield* new Conflict({ reason: "recording_identity" });
    // Viewers of a shared table see this name; the device shows its own player as "You".
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
      commands: [],
      tables: [],
      participants: [],
      players: [],
      visits: [],
      entries: [],
    };
  const mine = sql.in(actorPlayers);
  const paidTo = sql`(
    select to_player_id as id from repayments where from_player_id in ${mine}
    union select from_player_id from repayments where to_player_id in ${mine}
  )`;
  // Everything at the tables it started or records for; elsewhere, only its own play, and what it
  // recorded there while it could.
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
  // Who joined the tables it sees whole, and who it is at others'. A table it started lists only
  // who joined through the link: it added everyone else itself.
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
      or id in ${paidTo}
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
      or pair_first_player_id in ${mine} or pair_second_player_id in ${mine}
    order by seq
  `.pipe(Effect.flatMap(Access.decodeRows(PersonalOperationRow)));
  return {
    identity: { playerId: self.playerId, actorId: self.actorId },
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
  row: typeof TableRow.Type & { readonly starterPlayerId: PlayerId },
  viewerRole: TableView["viewerRole"],
  viewerPlayerId: PlayerId | null,
) {
  const sql = yield* SqlClient.SqlClient;
  const visits = yield* sql`
    select * from personal_visits where table_id = ${row.id} order by started_at, id
  `.pipe(Effect.flatMap(Access.decodeRows(PersonalVisitRow)));
  const players = yield* sql`
    select id, display_name from players
    where id in (select player_id from personal_visits where table_id = ${row.id})
      or id in (select player_id from table_participants where table_id = ${row.id})
    order by display_name, id
  `.pipe(Effect.flatMap(Access.decodeRows(PlayerIdentityRow)));
  const recorders = yield* recordersAt(row.id);
  // Players with an account, who could record for everyone: only the starter appoints.
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
  const view: TableView = {
    table: tableOf(row, row.starterPlayerId),
    players: players.map((player) => PlayerIdentity.make(player)),
    visits: visits.map((visit) => visitSummary(visitOf(visit), entries.map(entryOf))),
    viewerRole,
    viewerPlayerId,
    recorders: recorders.map((item) => item.playerId),
    appointable,
    shared: viewerRole === "starter" && row.shareTokenHash !== null,
  };
  return view;
});

/**
 * A table this recorder started, joined or records for, and its role there. Any other is a 404, so
 * its existence stays private.
 */
const tableAccess = Effect.fn("Recording.tableAccess")(function* (tableId: TableId) {
  const sql = yield* SqlClient.SqlClient;
  const { actorPlayers } = yield* principal();
  if (actorPlayers.length === 0) return yield* new NotFound({ resource: "table" });
  const [row] = yield* sql`select * from tables where id = ${tableId}`.pipe(
    Effect.flatMap(Access.decodeRows(TableRow)),
  );
  if (!row?.starterPlayerId) return yield* new NotFound({ resource: "table" });
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
  if (!player) return yield* new NotFound({ resource: "table" });
  return {
    row: at,
    role: recorder ? ("recorder" as const) : ("participant" as const),
    playerId: player.playerId,
  };
});

/** A table this recorder started. Anyone else at it is refused; anyone else gets a 404. */
const startedTable = Effect.fn("Recording.startedTable")(function* (tableId: TableId) {
  const access = yield* tableAccess(tableId);
  if (access.role !== "starter") return yield* new Forbidden({ reason: "starter_only" });
  return access.row;
});

export const table = Effect.fn("Recording.table")(function* (tableId: TableId) {
  const { row, role, playerId } = yield* tableAccess(tableId);
  return yield* viewOf(row, role, playerId);
});

/** A new read-only link. Only its hash is kept, so an earlier link stops working. */
export const share = Effect.fn("Recording.share")(function* (tableId: TableId) {
  const sql = yield* SqlClient.SqlClient;
  const row = yield* startedTable(tableId);
  const token = randomToken();
  yield* sql`update tables set share_token_hash = ${yield* digest(token)} where id = ${row.id}`;
  return { token };
});

export const unshare = Effect.fn("Recording.unshare")(function* (tableId: TableId) {
  const sql = yield* SqlClient.SqlClient;
  const row = yield* startedTable(tableId);
  yield* sql`update tables set share_token_hash = null where id = ${row.id}`;
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
  // A bad link creates nothing, not even the recorder's own player.
  const linked = yield* sql`select 1 from tables where share_token_hash = ${hash}`;
  if (linked.length === 0) return yield* new NotFound({ resource: "table" });
  const { self, actorPlayers } = yield* establish(request.identity);
  const attempt = Effect.gen(function* () {
    const [row] = yield* sql`select * from tables where share_token_hash = ${hash} for update`.pipe(
      Effect.flatMap(Access.decodeRows(TableRow)),
    );
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
    // Someone signed in who joins is the player, so the account claims it as it's made.
    const recorder = yield* Recorder;
    const created = yield* sql`
      insert into players (id, display_name, created_by_actor, user_id)
      values (${id}, ${displayName}, ${self.actorId},
        ${recorder._tag === "Account" ? recorder.user.userId : null})
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
    const joined: JoinedTable = { table, player: PlayerIdentity.make({ id, displayName }) };
    return joined;
  });
  return yield* sql
    .withTransaction(attempt)
    .pipe(
      Effect.catchTag("SqlError", (error) =>
        error.reason._tag === "UniqueViolation"
          ? Effect.fail<Conflict | typeof error>(new Conflict({ reason: "id_taken" }))
          : Effect.fail<Conflict | typeof error>(error),
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
  // An account's actor is public (it signs entries), so it can never be registered here.
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
    // Players are locked before anything else, as a revoke or a redeem does, and bindings are read
    // only after: a binding revoked before the lock can't be claimed, and one revoked after waits.
    const candidates = yield* heldBy;
    yield* lockPlayers(candidates);
    // While the actor is locked, nothing can bind it to another player.
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
      for (const player of held.filter((player) => !taken.includes(player))) {
        // An existing binding stays as it is: never brought back once revoked, never rewritten.
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
        }
        yield* sql`update players set user_id = ${user.userId} where id = ${player.id}`;
        linked.push(player);
      }
      return {
        adopted: false,
        claimed: fresh.filter((player) => linked.includes(player)).map(identity),
        refused: taken.map(identity),
      } satisfies ClaimResult;
    }
    // The actor becomes the account's: from now on the account's session records as it. One that
    // never pushed has no player yet; the account's next push creates it.
    yield* sql`
      update recording_actors set kind = 'account', secret_hash = null
      where id = ${request.actorId}
    `;
    // The account takes the device's bindings with it, so players another account claimed first
    // are let go rather than handed over.
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
    return {
      adopted: self?.userId === null,
      claimed: fresh.map((player) =>
        player === self ? { id: player.id, displayName: name } : identity(player),
      ),
      refused: taken.map(identity),
    } satisfies ClaimResult;
  });
  // Two devices claiming for one account at once: the loser rolls back and keeps its actor.
  return yield* sql
    .withTransaction(claim)
    .pipe(
      Effect.catchTag("SqlError", (error) =>
        error.reason._tag === "UniqueViolation"
          ? Effect.fail<Conflict | typeof error>(new Conflict({ reason: "recording_identity" }))
          : Effect.fail<Conflict | typeof error>(error),
      ),
    );
});
