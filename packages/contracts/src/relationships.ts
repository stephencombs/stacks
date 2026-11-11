import * as Schema from "effect/Schema";

import { ActorId, EntryId, PlayerId, TableId, TripId, VisitId } from "./ids.ts";
import { MinorUnits } from "./money.ts";
import { PlayerIdentity } from "./players.ts";
import { PlayEntry, Repayment } from "./recording.ts";

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

/**
 * One of the caller's players and someone they've shared a table with, and what's owed between
 * them from play and payments outside any Trip. `balance` is null when they're square. These are
 * not the legacy Trip balances, which stay on each Trip's Settle up.
 */
export const PlayerPair = Schema.Struct({
  playerId: PlayerId,
  counterparty: PlayerIdentity,
  balance: Schema.NullOr(PairBalance),
});
export type PlayerPair = typeof PlayerPair.Type;

/** Only pairs that include one of the caller's own players. */
export const PlayerBalances = Schema.Struct({ pairs: Schema.Array(PlayerPair) });
export type PlayerBalances = typeof PlayerBalances.Type;

/** A covered buy-in or held cash-out between the pair, with the player whose visit it's in. */
export const PairPlay = Schema.Struct({ playerId: PlayerId, tableId: TableId, entry: PlayEntry });
export type PairPlay = typeof PairPlay.Type;

/**
 * Everything between one of the caller's players and a counterparty, voids and replacements
 * included. `actors` name who recorded each fact. `revision` is what the pair's next payment
 * command expects.
 */
export const PairHistory = Schema.Struct({
  pair: PlayerPair,
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  play: Schema.Array(PairPlay),
  repayments: Schema.Array(Repayment),
  actors: Schema.Array(Schema.Struct({ actorId: ActorId, displayName: Schema.String })),
});
export type PairHistory = typeof PairHistory.Type;
