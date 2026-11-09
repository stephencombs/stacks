import * as Schema from "effect/Schema";

import { ActorId, EntryId, TableId, VenueId, VisitId } from "./ids.ts";
import { Game } from "./ledger.ts";
import { MinorUnits } from "./money.ts";

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
const start = {
  ...common,
  tableId: TableId,
  visitId: VisitId,
  buyInId: EntryId,
  buyIn: MinorUnits.check(Schema.isGreaterThan(0)),
  startedAt: Schema.DateTimeUtc,
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

// Local actor attribution is audit data, never verified server authority.
export const RecordingCommand = Schema.Union([
  Schema.Struct({ type: Schema.Literal("start"), ...start }),
  Schema.Struct({
    type: Schema.Literal("record_completed"),
    ...start,
    cashOutId: EntryId,
    cashOut: MinorUnits.check(Schema.isGreaterThanOrEqualTo(0)),
    finishedAt: Schema.DateTimeUtc,
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
