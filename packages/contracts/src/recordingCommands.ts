import * as Schema from "effect/Schema";

import { ActorId, EntryId, PlayerId, TableId, VenueId, VisitId } from "./ids.ts";
import { Game } from "./ledger.ts";
import { MinorUnits } from "./money.ts";
import { PlayerIdentity } from "./players.ts";
import { PlayEntry, Table, Visit } from "./recording.ts";

export const RecordingOperationId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand("RecordingOperationId"),
);
export type RecordingOperationId = typeof RecordingOperationId.Type;

const common = {
  operationId: RecordingOperationId,
  actorId: ActorId,
  preparedAt: Schema.DateTimeUtc,
};
const existing = {
  ...common,
  visitId: VisitId,
  expectedRevision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
};
const visit = {
  ...common,
  tableId: TableId,
  visitId: VisitId,
  playerId: PlayerId,
  buyInId: EntryId,
  buyIn: MinorUnits.check(Schema.isGreaterThan(0)),
  startedAt: Schema.DateTimeUtc,
};
const start = {
  ...visit,
  game: Schema.NullOr(Game),
  venueId: Schema.NullOr(VenueId),
  highLimit: Schema.Boolean,
};
export const RecordingReplacement = Schema.Struct({
  id: EntryId,
  amount: MinorUnits,
  occurredAt: Schema.DateTimeUtc,
  note: Schema.NullOr(Schema.String),
});
export type RecordingReplacement = typeof RecordingReplacement.Type;

// The actor is checked against the push's credential; the rules decide what it may record.
export const RecordingCommand = Schema.Union([
  Schema.Struct({ type: Schema.Literal("start"), ...start }),
  Schema.Struct({
    type: Schema.Literal("record_completed"),
    ...start,
    cashOutId: EntryId,
    cashOut: MinorUnits.check(Schema.isGreaterThanOrEqualTo(0)),
    finishedAt: Schema.DateTimeUtc,
  }),
  // A visit at a table that already exists, for a saved player or a new one.
  Schema.Struct({
    type: Schema.Literal("join_table"),
    ...visit,
    newPlayer: Schema.optionalKey(
      Schema.Struct({
        id: PlayerId,
        displayName: Schema.Trimmed.check(Schema.isNonEmpty(), Schema.isMaxLength(60)),
      }),
    ),
  }),
  Schema.Struct({
    type: Schema.Literal("add"),
    ...existing,
    entryId: EntryId,
    kind: Schema.Literals(["buy_in", "cash_out"]),
    amount: MinorUnits,
    occurredAt: Schema.DateTimeUtc,
    note: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal("finish"),
    ...existing,
    entryId: EntryId,
    amount: MinorUnits.check(Schema.isGreaterThanOrEqualTo(0)),
    finishedAt: Schema.DateTimeUtc,
  }),
  Schema.Struct({
    type: Schema.Literal("correct"),
    ...existing,
    entryId: EntryId,
    reason: Schema.NonEmptyString,
    replacement: Schema.NullOr(RecordingReplacement),
  }),
  Schema.Struct({ type: Schema.Literal("reopen"), ...existing, reason: Schema.NonEmptyString }),
]);
export type RecordingCommand = typeof RecordingCommand.Type;

/** The player and actor a device records as. An account's are the same on every device. */
export const RecordingIdentity = Schema.Struct({ playerId: PlayerId, actorId: ActorId });
export type RecordingIdentity = typeof RecordingIdentity.Type;

export const RecordingRejectionReason = Schema.Literals([
  "invalid",
  "conflict",
  "operation_reused",
  "forbidden",
]);
export type RecordingRejectionReason = typeof RecordingRejectionReason.Type;

export const PushRecordingRequest = Schema.Struct({
  identity: RecordingIdentity,
  commands: Schema.Array(RecordingCommand).check(Schema.isMinLength(1), Schema.isMaxLength(100)),
});
export type PushRecordingRequest = typeof PushRecordingRequest.Type;

export const RecordingCommandResult = Schema.Union([
  Schema.Struct({ operationId: RecordingOperationId, status: Schema.Literal("accepted") }),
  Schema.Struct({
    operationId: RecordingOperationId,
    status: Schema.Literal("rejected"),
    reason: RecordingRejectionReason,
    message: Schema.String,
  }),
]);
export type RecordingCommandResult = typeof RecordingCommandResult.Type;

export const PushRecordingResponse = Schema.Struct({
  results: Schema.Array(RecordingCommandResult),
});
export type PushRecordingResponse = typeof PushRecordingResponse.Type;

/** A device actor's credential. The server keeps only a hash of the secret. */
export const ActorCredential = Schema.Struct({
  actorId: ActorId,
  secret: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
});
export type ActorCredential = typeof ActorCredential.Type;

/**
 * Everything at the tables this account or device started. `commands` are in the order the
 * server applied them.
 */
export const RecordingHistory = Schema.Struct({
  identity: Schema.NullOr(RecordingIdentity),
  commands: Schema.Array(RecordingCommand),
  tables: Schema.Array(Table),
  visits: Schema.Array(Visit),
  entries: Schema.Array(PlayEntry),
});
export type RecordingHistory = typeof RecordingHistory.Type;

/** One table as its starter, or anyone with its share link, sees it. */
export const TableView = Schema.Struct({
  table: Table,
  players: Schema.Array(PlayerIdentity),
  visits: Schema.Array(Visit),
  entries: Schema.Array(PlayEntry),
  viewerRole: Schema.Literals(["starter", "viewer"]),
});
export type TableView = typeof TableView.Type;

export const ShareLink = Schema.Struct({ token: Schema.String });
export type ShareLink = typeof ShareLink.Type;
