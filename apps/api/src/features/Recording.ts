import * as Data from "effect/Data";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import { Conflict, CurrentUser, PlayEntry, Table, Visit } from "@stacks/contracts";
import {
  RecordingCommand,
  type PushRecordingRequest,
  type RecordingCommandResult,
  type RecordingIdentity,
  type RecordingRejectionReason,
} from "@stacks/contracts/recordingCommands";
import {
  applyRecordingCommand,
  RecordingError,
  type RecordingLedger,
} from "@stacks/shared/recording";

import {
  PersonalEntryRow,
  PersonalOperationRow,
  PersonalVisitRow,
  RecordingIdentityRow,
} from "../db/rows.ts";
import * as Access from "./Access.ts";

class Rejected extends Data.TaggedError("Rejected")<{
  readonly reason: RecordingRejectionReason;
  readonly message: string;
}> {}

type Identity = typeof RecordingIdentityRow.Type;

const commandJson = Schema.encodeSync(Schema.toCodecJson(RecordingCommand));
const commandText = (command: RecordingCommand) => JSON.stringify(commandJson(command));
const date = DateTime.toDateUtc;

const identity = Effect.fn("Recording.identity")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  const [row] = yield* sql`
    select id as player_id, recording_actor_id as actor_id, display_name
    from players where user_id = ${userId} and group_id is null
  `.pipe(Effect.flatMap(Access.decodeRows(RecordingIdentityRow)));
  return row ?? null;
});

const tableOf = (visit: typeof PersonalVisitRow.Type, owner: Identity) =>
  Table.make({
    id: visit.tableId,
    tripId: null,
    game: visit.game,
    venueId: visit.venueId,
    highLimit: visit.highLimit,
    starterActorId: owner.actorId,
  });

const visitOf = (visit: typeof PersonalVisitRow.Type, owner: Identity) =>
  Visit.make({
    id: visit.id,
    tableId: visit.tableId,
    playerId: owner.playerId,
    startedAt: visit.startedAt,
    finishedAt: visit.finishedAt,
    revision: visit.revision,
  });

const entryOf = (entry: typeof PersonalEntryRow.Type) =>
  PlayEntry.make({ ...entry, counterpartyId: null, currency: "USD" });

/** One visit's records and command history, locked until the transaction ends. */
const loadVisit = Effect.fn("Recording.loadVisit")(function* (
  owner: Identity,
  command: RecordingCommand,
) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  const ledger = (
    rows: ReadonlyArray<typeof PersonalVisitRow.Type>,
    entries: ReadonlyArray<PlayEntry>,
    commands: ReadonlyArray<RecordingCommand>,
  ): RecordingLedger => ({
    self: { id: owner.playerId, displayName: owner.displayName },
    actor: { id: owner.actorId, userId },
    tables: rows.map((row) => tableOf(row, owner)),
    visits: rows.map((row) => visitOf(row, owner)),
    entries,
    receipts: commands.map((item, index) => ({ command: item, revision: index + 2 })),
  });
  if (command.type === "start" || command.type === "record_completed") {
    const taken = yield* sql`
      select 1 from personal_visits where id = ${command.visitId} or table_id = ${command.tableId}
    `;
    if (taken.length > 0)
      return yield* new Rejected({ reason: "invalid", message: "Start IDs are already used." });
    return ledger([], [], []);
  }
  const rows = yield* sql`
    select v.* from personal_visits v
    where v.id = ${command.visitId} and v.player_id = ${owner.playerId}
    for update
  `.pipe(Effect.flatMap(Access.decodeRows(PersonalVisitRow)));
  if (rows.length === 0)
    return yield* new Rejected({ reason: "invalid", message: "Visit does not exist." });
  const entries = yield* sql`
    select * from personal_entries where visit_id = ${command.visitId}
  `.pipe(Effect.flatMap(Access.decodeRows(PersonalEntryRow)));
  const operations = yield* sql`
    select player_id, command from personal_operations
    where visit_id = ${command.visitId} and id <> ${command.operationId}
    order by seq
  `.pipe(Effect.flatMap(Access.decodeRows(PersonalOperationRow)));
  return ledger(
    rows,
    entries.map(entryOf),
    operations.map((row) => row.command),
  );
});

const save = Effect.fn("Recording.save")(function* (
  owner: Identity,
  before: RecordingLedger,
  after: RecordingLedger,
) {
  const sql = yield* SqlClient.SqlClient;
  const known = new Map(before.entries.map((entry) => [entry.id, entry]));
  const added = after.entries.filter((entry) => !known.has(entry.id));
  if (added.length > 0) {
    const taken = yield* sql`
      select 1 from personal_entries where id in ${sql.in(added.map((entry) => entry.id))}
    `;
    if (taken.length > 0)
      return yield* new Rejected({ reason: "invalid", message: "Entry ID is already used." });
  }
  const visit = after.visits[0]!;
  if (before.visits.length === 0) {
    const table = after.tables[0]!;
    yield* sql`
      insert into personal_visits
        (id, player_id, table_id, game, venue_id, high_limit, started_at, finished_at, revision)
      values (
        ${visit.id}, ${owner.playerId}, ${table.id}, ${table.game}, ${table.venueId},
        ${table.highLimit}, ${date(visit.startedAt)},
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
});

/** Applies one command in its own transaction; a rejection rolls back everything it touched. */
const applyOne = Effect.fn("Recording.applyOne")(function* (
  owner: Identity,
  command: RecordingCommand,
) {
  const sql = yield* SqlClient.SqlClient;
  const apply = Effect.gen(function* () {
    const inserted = yield* sql`
      insert into personal_operations (id, player_id, visit_id, command)
      values (${command.operationId}, ${owner.playerId}, ${command.visitId},
        ${commandText(command)}::jsonb)
      on conflict (id) do nothing
      returning id
    `;
    if (inserted.length === 0) {
      const [existing] = yield* sql`
        select player_id, command from personal_operations where id = ${command.operationId}
      `.pipe(Effect.flatMap(Access.decodeRows(PersonalOperationRow)));
      if (
        existing?.playerId === owner.playerId &&
        commandText(existing.command) === commandText(command)
      )
        return;
      return yield* new Rejected({
        reason: "operation_reused",
        message: "This operation ID was already saved with different content.",
      });
    }
    const before = yield* loadVisit(owner, command);
    const after = yield* Effect.try({
      try: () => applyRecordingCommand(before, command),
      catch: (error) => error,
    }).pipe(
      Effect.catch((error) =>
        error instanceof RecordingError &&
        (error.reason === "invalid" || error.reason === "conflict")
          ? Effect.fail(new Rejected({ reason: error.reason, message: error.message }))
          : Effect.die(error),
      ),
    );
    yield* save(owner, before, after);
  });
  return yield* sql.withTransaction(apply).pipe(
    // A concurrent push can claim the same IDs between the check and the insert.
    Effect.mapError((error) =>
      error._tag === "SqlError" && error.reason._tag === "UniqueViolation"
        ? new Rejected({ reason: "invalid", message: "Start IDs are already used." })
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
 * Applies commands in order with the same rules the device used. The first push from any device
 * establishes the account's recording identity; a device with a different one must pull and
 * adopt it first.
 */
export const push = Effect.fn("Recording.push")(function* (request: PushRecordingRequest) {
  const sql = yield* SqlClient.SqlClient;
  const user = yield* CurrentUser;
  yield* Access.ensureUser();
  yield* sql`
    insert into players (id, group_id, display_name, user_id, created_by, recording_actor_id)
    values (${request.identity.playerId}, null, ${user.displayName.slice(0, 60) || "You"},
      ${user.userId}, ${user.userId}, ${request.identity.actorId})
    on conflict do nothing
  `;
  const owner = yield* identity();
  if (
    !owner ||
    owner.playerId !== request.identity.playerId ||
    owner.actorId !== request.identity.actorId
  )
    return yield* new Conflict({ reason: "recording_identity" });
  const results = yield* Effect.forEach(request.commands, (command) => applyOne(owner, command));
  return { results };
});

export const history = Effect.fn("Recording.history")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const owner = yield* identity();
  if (!owner) return { identity: null, commands: [], tables: [], visits: [], entries: [] };
  const visits = yield* sql`
    select * from personal_visits where player_id = ${owner.playerId} order by started_at, id
  `.pipe(Effect.flatMap(Access.decodeRows(PersonalVisitRow)));
  const entries = yield* sql`
    select e.* from personal_entries e
    join personal_visits v on v.id = e.visit_id
    where v.player_id = ${owner.playerId}
    order by e.created_at, e.id
  `.pipe(Effect.flatMap(Access.decodeRows(PersonalEntryRow)));
  const operations = yield* sql`
    select player_id, command from personal_operations
    where player_id = ${owner.playerId} order by seq
  `.pipe(Effect.flatMap(Access.decodeRows(PersonalOperationRow)));
  const recordingIdentity: RecordingIdentity = {
    playerId: owner.playerId,
    actorId: owner.actorId,
  };
  return {
    identity: recordingIdentity,
    commands: operations.map((row) => row.command),
    tables: visits.map((visit) => tableOf(visit, owner)),
    visits: visits.map((visit) => visitOf(visit, owner)),
    entries: entries.map(entryOf),
  };
});
