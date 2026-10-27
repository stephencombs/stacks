import * as Schema from "effect/Schema";

import { EntryId, GroupId, PlayerId, SessionId, UserId, VenueId } from "./ids.ts";
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
 * - `cash_out`: chips cashed by `playerId`. A counterparty kept the cash, so they owe the player.
 * - `adjustment`: a signed correction to the player's result. Never creates a debt.
 * - `settlement`: `playerId` paid `counterpartyId` back outside the app.
 */
export const EntryKind = Schema.Literals(["buy_in", "cash_out", "adjustment", "settlement"]);
export type EntryKind = typeof EntryKind.Type;

export const Entry = Schema.Struct({
  id: EntryId,
  groupId: GroupId,
  sessionId: Schema.NullOr(SessionId),
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
  readonly playerId: PlayerId;
  readonly counterpartyId: PlayerId | null;
  readonly amount: number;
}) {
  if (entry.kind === "settlement") {
    if (entry.sessionId !== null)
      return { path: ["sessionId"], issue: "settlements aren't part of a session" };
    if (entry.counterpartyId === null || entry.counterpartyId === entry.playerId) {
      return { path: ["counterpartyId"], issue: "a settlement is paid to another player" };
    }
    return entry.amount > 0 ? undefined : { path: ["amount"], issue: "must be positive" };
  }
  if (entry.sessionId === null)
    return { path: ["sessionId"], issue: "required for session entries" };
  if (entry.kind === "adjustment") {
    if (entry.counterpartyId !== null) {
      return { path: ["counterpartyId"], issue: "adjustments don't involve another player" };
    }
    return entry.amount !== 0 ? undefined : { path: ["amount"], issue: "must not be zero" };
  }
  if (entry.counterpartyId === entry.playerId) {
    return { path: ["counterpartyId"], issue: "leave empty when it's the player's own money" };
  }
  return entry.amount > 0 ? undefined : { path: ["amount"], issue: "must be positive" };
}
