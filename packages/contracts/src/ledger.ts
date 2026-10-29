import * as Schema from "effect/Schema";

import { EntryId, GroupId, PlayerId, SessionId, StakeId, TripId, UserId, VenueId } from "./ids.ts";
import { MinorUnits } from "./money.ts";

export const Game = Schema.Literals([
  "slots",
  "blackjack",
  "roulette",
  "craps",
  "baccarat",
  "poker_cash",
  "poker_tourney",
  "other",
]);
export type Game = typeof Game.Type;

export const SessionStatus = Schema.Literals(["live", "closed"]);
export type SessionStatus = typeof SessionStatus.Type;

export const Session = Schema.Struct({
  id: SessionId,
  groupId: GroupId,
  tripId: TripId,
  venueId: VenueId,
  game: Game,
  status: SessionStatus,
  startedAt: Schema.DateTimeUtc,
  endedAt: Schema.NullOr(Schema.DateTimeUtc),
  notes: Schema.NullOr(Schema.String),
}).check(
  Schema.makeFilter((session) =>
    (session.status === "closed") === (session.endedAt !== null)
      ? undefined
      : { path: ["endedAt"], issue: "a closed session has an end time and a live one doesn't" },
  ),
);
export type Session = typeof Session.Type;

/**
 * - `buy_in`: chips bought by `playerId`. A counterparty paid for them, so the player owes them.
 * - `cash_out`: chips cashed by `playerId`, zero for a bust. A counterparty kept the cash, so they
 *   owe the player.
 * - `adjustment`: a signed correction to the player's result. Never creates a debt.
 * - `settlement`: `playerId` paid `counterpartyId` back outside the app.
 */
export const EntryKind = Schema.Literals(["buy_in", "cash_out", "adjustment", "settlement"]);
export type EntryKind = typeof EntryKind.Type;

export const Entry = Schema.Struct({
  id: EntryId,
  groupId: GroupId,
  sessionId: Schema.NullOr(SessionId),
  /** Set only on a settlement; a session's entries belong to the session's trip. */
  tripId: Schema.NullOr(TripId),
  kind: EntryKind,
  playerId: PlayerId,
  counterpartyId: Schema.NullOr(PlayerId),
  amount: MinorUnits,
  occurredAt: Schema.DateTimeUtc,
  note: Schema.NullOr(Schema.String),
  createdBy: UserId,
  createdAt: Schema.DateTimeUtc,
  voidedAt: Schema.NullOr(Schema.DateTimeUtc),
  voidedBy: Schema.NullOr(UserId),
  voidReason: Schema.NullOr(Schema.String),
  replacesEntryId: Schema.NullOr(EntryId),
}).check(Schema.makeFilter(entryShapeIssue));
export type Entry = typeof Entry.Type;

function entryShapeIssue(entry: {
  readonly kind: EntryKind;
  readonly sessionId: SessionId | null;
  readonly tripId: TripId | null;
  readonly playerId: PlayerId;
  readonly counterpartyId: PlayerId | null;
  readonly amount: number;
}) {
  if (entry.kind === "settlement") {
    if (entry.sessionId !== null)
      return { path: ["sessionId"], issue: "settlements aren't part of a session" };
    if (entry.tripId === null) return { path: ["tripId"], issue: "a settlement squares up a trip" };
    if (entry.counterpartyId === null || entry.counterpartyId === entry.playerId) {
      return { path: ["counterpartyId"], issue: "a settlement is paid to another player" };
    }
    return entry.amount > 0 ? undefined : { path: ["amount"], issue: "must be positive" };
  }
  if (entry.sessionId === null)
    return { path: ["sessionId"], issue: "required for session entries" };
  if (entry.tripId !== null)
    return { path: ["tripId"], issue: "a session's entries belong to the session's trip" };
  if (entry.kind === "adjustment") {
    if (entry.counterpartyId !== null) {
      return { path: ["counterpartyId"], issue: "adjustments don't involve another player" };
    }
    return entry.amount !== 0 ? undefined : { path: ["amount"], issue: "must not be zero" };
  }
  if (entry.counterpartyId === entry.playerId) {
    return { path: ["counterpartyId"], issue: "leave empty when it's the player's own money" };
  }
  // A player who busted cashes out zero, which is what lets the session close.
  if (entry.kind === "cash_out") {
    return entry.amount >= 0 ? undefined : { path: ["amount"], issue: "must not be negative" };
  }
  return entry.amount > 0 ? undefined : { path: ["amount"], issue: "must be positive" };
}

/**
 * Money `lenderId` gave `borrowerId` to play with. While it's open, the borrower's results go to
 * it: the lender gets the stake back plus `lenderShare` percent of the winnings, or what's left
 * of the stake after losses. Several stakes on one borrower split each result by amount.
 */
export const Stake = Schema.Struct({
  id: StakeId,
  groupId: GroupId,
  /** A stake covers the borrower's sessions in this trip that start while it's open. */
  tripId: TripId,
  lenderId: PlayerId,
  borrowerId: PlayerId,
  amount: MinorUnits,
  lenderShare: Schema.Int,
  startedAt: Schema.DateTimeUtc,
  endedAt: Schema.NullOr(Schema.DateTimeUtc),
  note: Schema.NullOr(Schema.String),
  createdBy: UserId,
  createdAt: Schema.DateTimeUtc,
  voidedAt: Schema.NullOr(Schema.DateTimeUtc),
  voidedBy: Schema.NullOr(UserId),
  voidReason: Schema.NullOr(Schema.String),
});
export type Stake = typeof Stake.Type;

/**
 * A trip: a group's weekend in Vegas, or any run of play. Every session belongs to one, and each
 * trip keeps its own balances and settles up on its own. An ended trip takes no new sessions.
 */
export const Trip = Schema.Struct({
  id: TripId,
  groupId: GroupId,
  name: Schema.String,
  startedAt: Schema.DateTimeUtc,
  endedAt: Schema.NullOr(Schema.DateTimeUtc),
  createdBy: UserId,
  createdAt: Schema.DateTimeUtc,
});
export type Trip = typeof Trip.Type;
