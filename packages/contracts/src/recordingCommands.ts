import * as Schema from "effect/Schema";

import { ActorId, EntryId, PlayerId, PlayerInviteId, TableId, VenueId, VisitId } from "./ids.ts";
import { Game } from "./ledger.ts";
import { MinorUnits } from "./money.ts";
import { PlayerIdentity } from "./players.ts";
import { PlayEntry, Table, Visit, VisitSummary } from "./recording.ts";

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
const recorder = { ...common, tableId: TableId, playerId: PlayerId };
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
  // The starter lets a player at the table record for everyone, or stops them. These belong to
  // the table, not a visit, and are ordered with its play.
  Schema.Struct({ type: Schema.Literal("appoint_recorder"), ...recorder }),
  Schema.Struct({ type: Schema.Literal("revoke_recorder"), ...recorder }),
]);
export type RecordingCommand = typeof RecordingCommand.Type;
export type TableCommand = Extract<
  RecordingCommand,
  { type: "appoint_recorder" | "revoke_recorder" }
>;
export type VisitCommand = Exclude<RecordingCommand, TableCommand>;
export const isTableCommand = (command: RecordingCommand): command is TableCommand =>
  command.type === "appoint_recorder" || command.type === "revoke_recorder";

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

/** A player who joined a table through its link. */
export const TableParticipant = Schema.Struct({ tableId: TableId, player: PlayerIdentity });
export type TableParticipant = typeof TableParticipant.Type;

/**
 * Everything at the tables this account or device started or records at, and its own play at
 * the tables it joined. `participants` are who joined those tables, and who it plays as at
 * others'. `players` are anyone else whose play it sees. `commands` are in the order the server
 * applied them, whoever made them.
 */
export const RecordingHistory = Schema.Struct({
  identity: Schema.NullOr(RecordingIdentity),
  commands: Schema.Array(RecordingCommand),
  tables: Schema.Array(Table),
  participants: Schema.Array(TableParticipant),
  players: Schema.Array(PlayerIdentity),
  visits: Schema.Array(Visit),
  entries: Schema.Array(PlayEntry),
});
export type RecordingHistory = typeof RecordingHistory.Type;

/**
 * One table as its starter, a player who joined it, or anyone with its share link sees it: each
 * visit's totals, never its entries, whose audit fields name actors. `viewerPlayerId` is the
 * viewer's own player there, if they have one. `recorders` record for everyone. Only the starter
 * sees `appointable`, the players with accounts, and whether the table is `shared`.
 */
export const TableView = Schema.Struct({
  table: Table,
  players: Schema.Array(PlayerIdentity),
  visits: Schema.Array(VisitSummary),
  viewerRole: Schema.Literals(["starter", "recorder", "participant", "viewer"]),
  viewerPlayerId: Schema.NullOr(PlayerId),
  recorders: Schema.Array(PlayerId),
  appointable: Schema.Array(PlayerId),
  shared: Schema.Boolean,
});
export type TableView = typeof TableView.Type;

export const ShareLink = Schema.Struct({ token: Schema.String });
export type ShareLink = typeof ShareLink.Type;

/**
 * Joins a table through its link as a new player bound to the recorder. `identity` is the
 * recorder's own, as in a push. Joining again returns the player it joined as before.
 */
export const JoinTableRequest = Schema.Struct({
  identity: RecordingIdentity,
  player: Schema.Struct({
    id: PlayerId,
    displayName: Schema.Trimmed.check(Schema.isNonEmpty(), Schema.isMaxLength(60)),
  }),
});
export type JoinTableRequest = typeof JoinTableRequest.Type;

export const JoinedTable = Schema.Struct({ table: Table, player: PlayerIdentity });
export type JoinedTable = typeof JoinedTable.Type;

/** A personal invite's link. Only its hash is kept; issuing another revokes this one. */
export const PlayerInviteLink = Schema.Struct({ id: PlayerInviteId, token: Schema.String });
export type PlayerInviteLink = typeof PlayerInviteLink.Type;

/** What an invite link shows before it's used: whose play it records, at whose tables. */
export const PlayerInvitePreview = Schema.Struct({
  player: PlayerIdentity,
  startedBy: Schema.String,
});
export type PlayerInvitePreview = typeof PlayerInvitePreview.Type;

/** Redeems a personal invite as the recorder's own actor. `identity` is as in a push. */
export const RedeemInviteRequest = Schema.Struct({ identity: RecordingIdentity });
export type RedeemInviteRequest = typeof RedeemInviteRequest.Type;

/**
 * Who else records as a player: the open invite, if any, and the actors bound to them through a
 * link or an invite. An actor's own player is never listed; it can't be revoked.
 */
export const PlayerAccess = Schema.Struct({
  player: PlayerIdentity,
  invite: Schema.NullOr(Schema.Struct({ id: PlayerInviteId, createdAt: Schema.DateTimeUtc })),
  devices: Schema.Array(
    Schema.Struct({ actorId: ActorId, boundVia: Schema.Literals(["join", "invite"]) }),
  ),
});
export type PlayerAccess = typeof PlayerAccess.Type;
