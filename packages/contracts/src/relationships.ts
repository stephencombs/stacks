import * as Schema from "effect/Schema";

import { EntryId, PlayerId, TableId, TripId, VisitId } from "./ids.ts";
import { MinorUnits } from "./money.ts";

export const PairBalance = Schema.Struct({
  debtorId: PlayerId,
  creditorId: PlayerId,
  amount: MinorUnits.check(Schema.isGreaterThan(0)),
}).check(
  Schema.makeFilter((pair) =>
    pair.debtorId === pair.creditorId
      ? { path: ["creditorId"], issue: "an obligation is between different players" }
      : undefined,
  ),
);
export type PairBalance = typeof PairBalance.Type;

export const FinancialSource = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("play"),
    entryId: EntryId,
    visitId: VisitId,
    tableId: TableId,
    tripId: Schema.NullOr(TripId),
  }),
  Schema.Struct({
    kind: Schema.Literal("repayment"),
    entryId: EntryId,
    recordedFromTripId: Schema.NullOr(TripId),
  }),
]);
export type FinancialSource = typeof FinancialSource.Type;

export const FinancialContribution = Schema.Struct({
  debtorId: PlayerId,
  creditorId: PlayerId,
  amount: MinorUnits.check(Schema.isGreaterThan(0)),
  source: FinancialSource,
}).check(
  Schema.makeFilter((pair) =>
    pair.debtorId === pair.creditorId
      ? { path: ["creditorId"], issue: "an obligation is between different players" }
      : undefined,
  ),
);
export type FinancialContribution = typeof FinancialContribution.Type;
