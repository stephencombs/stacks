import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";

import { ActorId, EntryId, PlayerId, TableId, TripId, VenueId, VisitId } from "./ids.ts";
import { Game } from "./ledger.ts";
import { MinorUnits } from "./money.ts";

export const Table = Schema.Struct({
  id: TableId,
  tripId: Schema.NullOr(TripId),
  game: Schema.NullOr(Game),
  venueId: Schema.NullOr(VenueId),
  highLimit: Schema.Boolean,
  starterActorId: ActorId,
});
export type Table = typeof Table.Type;

export const Visit = Schema.Struct({
  id: VisitId,
  tableId: TableId,
  playerId: PlayerId,
  startedAt: Schema.DateTimeUtc,
  finishedAt: Schema.NullOr(Schema.DateTimeUtc),
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
}).check(
  Schema.makeFilter((visit) =>
    visit.finishedAt !== null &&
    DateTime.toEpochMillis(visit.finishedAt) < DateTime.toEpochMillis(visit.startedAt)
      ? { path: ["finishedAt"], issue: "must not precede the visit start" }
      : undefined,
  ),
);
export type Visit = typeof Visit.Type;

const auditFields = {
  createdBy: ActorId,
  createdAt: Schema.DateTimeUtc,
  voidedAt: Schema.NullOr(Schema.DateTimeUtc),
  voidedBy: Schema.NullOr(ActorId),
  voidReason: Schema.NullOr(Schema.String),
  replacesEntryId: Schema.NullOr(EntryId),
};

function auditIssue(fact: {
  readonly id: EntryId;
  readonly createdAt: DateTime.Utc;
  readonly voidedAt: DateTime.Utc | null;
  readonly voidedBy: ActorId | null;
  readonly voidReason: string | null;
  readonly replacesEntryId: EntryId | null;
}) {
  if ((fact.voidedAt === null) !== (fact.voidedBy === null)) {
    return { path: ["voidedBy"], issue: "void time and actor must be recorded together" };
  }
  if (fact.voidedAt === null && fact.voidReason !== null) {
    return { path: ["voidReason"], issue: "a live fact has no void reason" };
  }
  if (
    fact.voidedAt !== null &&
    DateTime.toEpochMillis(fact.voidedAt) < DateTime.toEpochMillis(fact.createdAt)
  ) {
    return { path: ["voidedAt"], issue: "must not precede creation" };
  }
  if (fact.replacesEntryId === fact.id) {
    return { path: ["replacesEntryId"], issue: "a replacement must have a new ID" };
  }
  return undefined;
}

export const PlayEntry = Schema.Struct({
  id: EntryId,
  visitId: VisitId,
  kind: Schema.Literals(["buy_in", "cash_out", "adjustment"]),
  counterpartyId: Schema.NullOr(PlayerId),
  amount: MinorUnits,
  currency: Schema.Literal("USD"),
  occurredAt: Schema.DateTimeUtc,
  note: Schema.NullOr(Schema.String),
  ...auditFields,
}).check(
  Schema.makeFilter((entry) => {
    const audit = auditIssue(entry);
    if (audit) return audit;
    if (entry.kind === "adjustment") {
      if (entry.counterpartyId !== null)
        return { path: ["counterpartyId"], issue: "adjustments have no counterparty" };
      return entry.amount !== 0 ? undefined : { path: ["amount"], issue: "must not be zero" };
    }
    return (entry.kind === "buy_in" ? entry.amount > 0 : entry.amount >= 0)
      ? undefined
      : {
          path: ["amount"],
          issue: entry.kind === "buy_in" ? "must be positive" : "must not be negative",
        };
  }),
);
export type PlayEntry = typeof PlayEntry.Type;

// Ownership comes from the visit; a fact cannot independently assign a player or table.
export const VisitRecording = Schema.Struct({
  visit: Visit,
  entries: Schema.Array(PlayEntry),
}).check(
  Schema.makeFilter(({ visit, entries }) => {
    const ids = new Set<EntryId>();
    for (const [index, entry] of entries.entries()) {
      if (entry.visitId !== visit.id)
        return { path: ["entries", index, "visitId"], issue: "must reference this visit" };
      if (entry.counterpartyId === visit.playerId)
        return {
          path: ["entries", index, "counterpartyId"],
          issue: "leave empty for the player's own money",
        };
      if (ids.has(entry.id)) return { path: ["entries", index, "id"], issue: "duplicate fact ID" };
      ids.add(entry.id);
    }
    return undefined;
  }),
);
export type VisitRecording = typeof VisitRecording.Type;

export const Repayment = Schema.Struct({
  id: EntryId,
  fromPlayerId: PlayerId,
  toPlayerId: PlayerId,
  amount: MinorUnits.check(Schema.isGreaterThan(0)),
  currency: Schema.Literal("USD"),
  occurredAt: Schema.DateTimeUtc,
  note: Schema.NullOr(Schema.String),
  /** Recording context, never an allocation of the payment against Trip debt. */
  recordedFromTripId: Schema.NullOr(TripId),
  ...auditFields,
}).check(
  Schema.makeFilter(
    (repayment) =>
      auditIssue(repayment) ??
      (repayment.fromPlayerId === repayment.toPlayerId
        ? { path: ["toPlayerId"], issue: "a repayment is between different players" }
        : undefined),
  ),
);
export type Repayment = typeof Repayment.Type;

export const VisitTotals = Schema.Struct({
  buyIn: MinorUnits.check(Schema.isGreaterThanOrEqualTo(0)),
  cashOut: MinorUnits.check(Schema.isGreaterThanOrEqualTo(0)),
  adjustment: MinorUnits,
});
export type VisitTotals = typeof VisitTotals.Type;

export const VisitSummary = Schema.Struct({
  visit: Visit,
  totals: VisitTotals,
  finalResult: Schema.NullOr(MinorUnits),
}).check(
  Schema.makeFilter(({ visit, totals, finalResult }) => {
    if ((visit.finishedAt === null) !== (finalResult === null))
      return { path: ["finalResult"], issue: "pending exactly while the visit is unfinished" };
    if (
      finalResult !== null &&
      BigInt(finalResult) !==
        BigInt(totals.cashOut) + BigInt(totals.adjustment) - BigInt(totals.buyIn)
    ) {
      return {
        path: ["finalResult"],
        issue: "must equal cash-outs plus adjustments minus buy-ins",
      };
    }
    return undefined;
  }),
);
export type VisitSummary = typeof VisitSummary.Type;
