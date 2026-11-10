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
  NotFound,
  PlayEntry,
  PlayerIdentity,
  Recorder,
  Table,
  Unauthorized,
  Visit,
  type PlayerId,
  type TableId,
} from "@stacks/contracts";
import {
  RecordingCommand,
  type ActorCredential,
  type PushRecordingRequest,
  type RecordingCommandResult,
  type RecordingRejectionReason,
  type TableView,
} from "@stacks/contracts/recordingCommands";
import {
  applyRecordingCommand,
  authorize,
  createdEntryIds,
  RecordingError,
  type RecordingLedger,
} from "@stacks/shared/recording";
import { visitSummary } from "@stacks/shared/visits";

import {
  PersonalEntryRow,
  PersonalOperationRow,
  PersonalVisitRow,
  PlayerIdentityRow,
  RecordingIdentityRow,
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
  message: "Only the player who started this table records here.",
} as const;
const readOnly = {
  reason: "invalid",
  message: "Imported history is read-only.",
} as const;

const commandJson = Schema.encodeSync(Schema.toCodecJson(RecordingCommand));
const commandText = (command: RecordingCommand) => JSON.stringify(commandJson(command));
const date = DateTime.toDateUtc;

/** Secrets and share tokens are 32 random bytes, so a fast hash is enough to keep them unusable. */
const digest = (secret: string) =>
  Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret))).pipe(
    Effect.map((hash) => Buffer.from(hash).toString("hex")),
  );

const personalIdentity = Effect.fn("Recording.personalIdentity")(function* (userId: string) {
  const sql = yield* SqlClient.SqlClient;
  const [row] = yield* sql`
    select id as player_id, recording_actor_id as actor_id, display_name
    from players where user_id = ${userId} and group_id is null
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

const boundPlayers = Effect.fn("Recording.boundPlayers")(function* (actorId: string) {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql<{ playerId: PlayerId }>`
    select player_id from player_actors where actor_id = ${actorId}
  `.pipe(Effect.map((rows) => rows.map((row) => row.playerId)));
});

const principal = Effect.fn("Recording.principal")(function* () {
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
    where pa.actor_id = ${actorId}
    order by p.created_at, p.id
    limit 1
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

const entryOf = (entry: typeof PersonalEntryRow.Type) =>
  PlayEntry.make({ ...entry, counterpartyId: null, currency: "USD" });

/** The table, locked until the transaction ends. Every command locks it before any visit. */
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
  if (!authorize(table, actorPlayers)) return yield* new Rejected(forbidden);
  return table;
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
    tables: [],
    visits: [],
    entries: [],
    receipts: [],
  };
  if (command.type === "start" || command.type === "record_completed") {
    const taken = yield* sql`
      select 1 from personal_visits where id = ${command.visitId}
      union all select 1 from tables where id = ${command.tableId}
    `;
    if (taken.length > 0) return yield* new Rejected(sessionRecorded);
    return ledger;
  }
  if (command.type === "join_table") {
    const table = yield* lockTable(command.tableId, actorPlayers);
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
      // Only players this actor added, or holds, can be chosen: never someone found by name.
      const saved = yield* sql`
        select id, display_name from players
        where id = ${command.playerId}
          and (created_by_actor = ${self.actorId}
            or id in (select player_id from player_actors where actor_id = ${self.actorId}))
      `.pipe(Effect.flatMap(Access.decodeRows(PlayerIdentityRow)));
      players = [...players, ...saved.map((row) => PlayerIdentity.make(row))];
    }
    return { ...ledger, players, tables: [table], visits: visits.map(visitOf) };
  }
  const [located] = yield* sql<{ tableId: TableId }>`
    select table_id from personal_visits where id = ${command.visitId}
  `;
  if (!located) return yield* new Rejected({ reason: "invalid", message: "Visit does not exist." });
  const table = yield* lockTable(located.tableId, actorPlayers);
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
          voided_at, voided_by, void_reason, replaces_entry_id
        ) values (
          ${entry.id}, ${entry.visitId}, ${entry.kind}, ${BigInt(entry.amount)},
          ${date(entry.occurredAt)}, ${entry.note}, ${entry.createdBy}, ${date(entry.createdAt)},
          ${entry.voidedAt ? date(entry.voidedAt) : null}, ${entry.voidedBy}, ${entry.voidReason},
          ${entry.replacesEntryId}
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
  constraint.startsWith("personal_entries")
    ? entryRecorded
    : constraint.startsWith("players")
      ? playerRecorded
      : constraint === "personal_visits_one_open"
        ? { reason: "invalid" as const, message: "This player is already playing at this table." }
        : sessionRecorded;

/** Applies one command in its own transaction; a rejection rolls back everything it touched. */
const applyOne = Effect.fn("Recording.applyOne")(function* (
  self: Identity,
  actorPlayers: ReadonlyArray<PlayerId>,
  command: RecordingCommand,
) {
  const sql = yield* SqlClient.SqlClient;
  const apply = Effect.gen(function* () {
    const [existing] = yield* sql`
      select actor_id, command from personal_operations where id = ${command.operationId}
    `.pipe(Effect.flatMap(Access.decodeRows(PersonalOperationRow)));
    if (existing) {
      if (
        existing.actorId === self.actorId &&
        commandText(existing.command) === commandText(command)
      )
        return;
      return yield* new Rejected({
        reason: "operation_reused",
        message: "This operation ID was already saved with different content.",
      });
    }
    const before = yield* loadLedger(self, actorPlayers, command);
    const created = createdEntryIds(command);
    if (created.length > 0) {
      const taken = yield* sql`select 1 from personal_entries where id in ${sql.in(created)}`;
      if (taken.length > 0) return yield* new Rejected(entryRecorded);
    }
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
    // A concurrent push can claim the same IDs between the check and the insert.
    Effect.mapError((error) =>
      error._tag === "SqlError" && error.reason._tag === "UniqueViolation"
        ? new Rejected(uniqueViolation(error.reason.constraint))
        : error,
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
 * Applies commands in order with the same rules the device used. An account's first push
 * establishes its recording identity; a device with a different one must pull and adopt it first.
 * A device actor's first push creates the player it records as.
 */
export const push = Effect.fn("Recording.push")(function* (request: PushRecordingRequest) {
  const sql = yield* SqlClient.SqlClient;
  const recorder = yield* Recorder;
  const { playerId, actorId } = request.identity;
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
        select id, recording_actor_id from players where user_id = ${user.userId} and group_id is null
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
  const { self, actorPlayers } = yield* principal();
  if (!self || self.playerId !== playerId || self.actorId !== actorId)
    return yield* new Conflict({ reason: "recording_identity" });
  const results = yield* Effect.forEach(request.commands, (command) =>
    applyOne(self, actorPlayers, command),
  );
  return { results };
});

export const history = Effect.fn("Recording.history")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const { self, actorPlayers } = yield* principal();
  if (!self || actorPlayers.length === 0)
    return { identity: null, commands: [], tables: [], visits: [], entries: [] };
  const started = sql`(select id from tables where starter_player_id in ${sql.in(actorPlayers)})`;
  const tables = yield* sql`select * from tables where id in ${started} order by id`.pipe(
    Effect.flatMap(Access.decodeRows(TableRow)),
  );
  const visits = yield* sql`
    select * from personal_visits where table_id in ${started} order by started_at, id
  `.pipe(Effect.flatMap(Access.decodeRows(PersonalVisitRow)));
  const entries = yield* sql`
    select e.* from personal_entries e
    join personal_visits v on v.id = e.visit_id
    where v.table_id in ${started}
    order by e.created_at, e.id
  `.pipe(Effect.flatMap(Access.decodeRows(PersonalEntryRow)));
  const operations = yield* sql`
    select actor_id, command from personal_operations where table_id in ${started} order by seq
  `.pipe(Effect.flatMap(Access.decodeRows(PersonalOperationRow)));
  return {
    identity: { playerId: self.playerId, actorId: self.actorId },
    commands: operations.map((row) => row.command),
    tables: tables.map((row) => tableOf(row, row.starterPlayerId!)),
    visits: visits.map(visitOf),
    entries: entries.map(entryOf),
  };
});

const viewOf = Effect.fn("Recording.viewOf")(function* (
  row: typeof TableRow.Type & { readonly starterPlayerId: PlayerId },
  viewerRole: TableView["viewerRole"],
) {
  const sql = yield* SqlClient.SqlClient;
  const visits = yield* sql`
    select * from personal_visits where table_id = ${row.id} order by started_at, id
  `.pipe(Effect.flatMap(Access.decodeRows(PersonalVisitRow)));
  const players = yield* sql`
    select id, display_name from players
    where id in (select player_id from personal_visits where table_id = ${row.id})
    order by display_name, id
  `.pipe(Effect.flatMap(Access.decodeRows(PlayerIdentityRow)));
  const entries = yield* sql`
    select e.* from personal_entries e join personal_visits v on v.id = e.visit_id
    where v.table_id = ${row.id}
  `.pipe(Effect.flatMap(Access.decodeRows(PersonalEntryRow)));
  const view: TableView = {
    table: tableOf(row, row.starterPlayerId),
    players: players.map((player) => PlayerIdentity.make(player)),
    visits: visits.map((visit) => visitSummary(visitOf(visit), entries.map(entryOf))),
    viewerRole,
  };
  return view;
});

/** A table this recorder started. Any other table is a 404, so its existence stays private. */
const startedTable = Effect.fn("Recording.startedTable")(function* (tableId: TableId) {
  const sql = yield* SqlClient.SqlClient;
  const { actorPlayers } = yield* principal();
  if (actorPlayers.length === 0) return yield* new NotFound({ resource: "table" });
  const [row] = yield* sql`
    select * from tables where id = ${tableId} and starter_player_id in ${sql.in(actorPlayers)}
  `.pipe(Effect.flatMap(Access.decodeRows(TableRow)));
  if (!row?.starterPlayerId) return yield* new NotFound({ resource: "table" });
  return { ...row, starterPlayerId: row.starterPlayerId };
});

export const table = Effect.fn("Recording.table")(function* (tableId: TableId) {
  return yield* viewOf(yield* startedTable(tableId), "starter");
});

/** A new read-only link. Only its hash is kept, so an earlier link stops working. */
export const share = Effect.fn("Recording.share")(function* (tableId: TableId) {
  const sql = yield* SqlClient.SqlClient;
  const row = yield* startedTable(tableId);
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
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
  return yield* viewOf({ ...row, starterPlayerId: row.starterPlayerId }, "viewer");
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

/**
 * Makes the player a device recorded as, signed out, the signed-in account's own player, so
 * its tables stay the account's. An account that already has a different player can't take it.
 */
export const claimActor = Effect.fn("Recording.claimActor")(function* (
  credential: ActorCredential,
) {
  const sql = yield* SqlClient.SqlClient;
  const user = yield* CurrentUser;
  const claim = Effect.gen(function* () {
    const [actor] = yield* sql<{ secretHash: string }>`
      select secret_hash from recording_actors where id = ${credential.actorId} and kind = 'device'
      for update
    `;
    if (!actor) return;
    if (actor.secretHash !== (yield* digest(credential.secret))) return yield* new Unauthorized();
    const [player] = yield* sql<{ id: PlayerId }>`
      select p.id from player_actors pa join players p on p.id = pa.player_id
      where pa.actor_id = ${credential.actorId} and p.created_by_actor = ${credential.actorId}
        and p.user_id is null and p.group_id is null
      for update of p
    `;
    if (player && (yield* personalIdentity(user.userId)))
      return yield* new Conflict({ reason: "recording_identity" });
    yield* Access.ensureUser();
    // The actor becomes the account's: from now on the account's session records as it. One that
    // never pushed has no player yet; the account's next push creates it.
    yield* sql`
      update recording_actors set kind = 'account', secret_hash = null
      where id = ${credential.actorId}
    `;
    if (player)
      yield* sql`
        update players
        set user_id = ${user.userId}, recording_actor_id = ${credential.actorId},
          display_name = ${user.displayName.slice(0, 60) || "You"}
        where id = ${player.id}
      `;
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
