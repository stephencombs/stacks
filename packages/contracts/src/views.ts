import * as Schema from "effect/Schema";

import {
  EntryId,
  GroupId,
  InviteId,
  PlayerId,
  SessionId,
  StakeId,
  TripId,
  UserId,
  VenueId,
} from "./ids.ts";
import { Entry, Game, Seat, Seating, Session, Stake, Trip } from "./ledger.ts";
import { CurrencyCode, MinorUnits } from "./money.ts";

export const MemberRole = Schema.Literals(["owner", "admin", "member"]);
export type MemberRole = typeof MemberRole.Type;

export const Group = Schema.Struct({
  id: GroupId,
  name: Schema.String,
  currency: CurrencyCode,
  createdAt: Schema.DateTimeUtc,
});
export type Group = typeof Group.Type;

export const VenmoHandle = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,30}$/));
export type VenmoHandle = typeof VenmoHandle.Type;

export const CashAppHandle = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,20}$/));
export type CashAppHandle = typeof CashAppHandle.Type;

export const PayPalHandle = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,30}$/));
export type PayPalHandle = typeof PayPalHandle.Type;

export const PaymentHandles = Schema.Struct({
  venmo: Schema.NullOr(VenmoHandle),
  cashApp: Schema.NullOr(CashAppHandle),
  paypal: Schema.NullOr(PayPalHandle),
});
export type PaymentHandles = typeof PaymentHandles.Type;

/**
 * Everyone who can appear in the ledger. A guest carries the `claimCode` that lets them claim it;
 * a former member keeps their history with no `role` and no `claimCode`.
 */
export const Player = Schema.Struct({
  id: PlayerId,
  displayName: Schema.String,
  userId: Schema.NullOr(UserId),
  role: Schema.NullOr(MemberRole),
  claimCode: Schema.NullOr(Schema.String),
  ...PaymentHandles.fields,
});
export type Player = typeof Player.Type;

export const Balance = Schema.Struct({ playerId: PlayerId, amount: MinorUnits });
export type Balance = typeof Balance.Type;

export const BalanceLine = Schema.Union([
  Schema.Struct({
    kind: Schema.Literals(["covered_buy_in", "held_cash_out", "settlement"]),
    entryId: EntryId,
    counterpartyId: PlayerId,
    amount: MinorUnits,
    occurredAt: Schema.DateTimeUtc,
    sessionId: Schema.NullOr(SessionId),
  }),
  Schema.Struct({
    kind: Schema.Literal("stake"),
    stakeId: StakeId,
    counterpartyId: PlayerId,
    amount: MinorUnits,
    principal: MinorUnits,
    lenderShare: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
    result: MinorUnits,
    occurredAt: Schema.DateTimeUtc,
  }),
]);
export type BalanceLine = typeof BalanceLine.Type;

export const BalanceExplanation = Schema.Struct({
  lines: Schema.Array(BalanceLine),
  total: MinorUnits,
});
export type BalanceExplanation = typeof BalanceExplanation.Type;

export const Transfer = Schema.Struct({ from: PlayerId, to: PlayerId, amount: MinorUnits });
export type Transfer = typeof Transfer.Type;

export const PlayerResult = Schema.Struct({
  playerId: PlayerId,
  buyIn: MinorUnits,
  cashOut: MinorUnits,
  adjustment: MinorUnits,
  net: MinorUnits,
});
export type PlayerResult = typeof PlayerResult.Type;

export const VenueKind = Schema.Literals(["casino", "online", "home"]);
export type VenueKind = typeof VenueKind.Type;

export const Venue = Schema.Struct({
  id: VenueId,
  name: Schema.String,
  kind: VenueKind,
  city: Schema.NullOr(Schema.String),
  region: Schema.NullOr(Schema.String),
  country: Schema.NullOr(Schema.String),
  lat: Schema.NullOr(Schema.Finite),
  lng: Schema.NullOr(Schema.Finite),
  verified: Schema.Boolean,
  /** Set only for a home venue, which only that group can see. */
  groupId: Schema.NullOr(GroupId),
});
export type Venue = typeof Venue.Type;

export const SessionSummary = Schema.Struct({
  session: Session,
  venue: Venue,
  /** Everyone seated at the table, in the order they sat down. */
  playerIds: Schema.Array(PlayerId),
  /** Who's still at a live table: seated and not cashed out. Empty once it closes. */
  playing: Schema.Array(PlayerId),
  myJoinedAt: Schema.optionalKey(Schema.NullOr(Schema.DateTimeUtc)),
  ledgerEntryIds: Schema.optionalKey(Schema.Array(EntryId)),
  myLedgerEntries: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        id: EntryId,
        kind: Schema.Literals(["buy_in", "cash_out", "adjustment"]),
        amount: MinorUnits,
        voidedAt: Schema.NullOr(Schema.DateTimeUtc),
      }),
    ),
  ),
  results: Schema.Array(PlayerResult),
});
export type SessionSummary = typeof SessionSummary.Type;

export const SessionDetail = Schema.Struct({
  session: Session,
  venue: Venue,
  playerIds: Schema.Array(PlayerId),
  myJoinedAt: Schema.optionalKey(Schema.NullOr(Schema.DateTimeUtc)),
  results: Schema.Array(PlayerResult),
  entries: Schema.Array(Entry),
  /** Every sit, move and stand, oldest first. */
  seatings: Schema.Array(Seating),
});
export type SessionDetail = typeof SessionDetail.Type;

export const GroupListItem = Schema.Struct({
  group: Group,
  role: MemberRole,
  myPlayerId: PlayerId,
  myBalance: MinorUnits,
  liveSessionCount: Schema.Int,
  /** The trip still going, most recently started first; where the app opens. */
  currentTripId: Schema.NullOr(TripId),
  /** Newest first. */
  trips: Schema.Array(Trip),
  /** The live session you're seated at, if any. */
  mySession: Schema.NullOr(
    Schema.Struct({
      id: SessionId,
      tripId: TripId,
      venueName: Schema.String,
      startedAt: Schema.DateTimeUtc,
    }),
  ),
});
export type GroupListItem = typeof GroupListItem.Type;

/** A stake and where it stands: the borrower's result so far and what they'd hand back now. */
export const StakeView = Schema.Struct({
  stake: Stake,
  result: MinorUnits,
  owed: MinorUnits,
});
export type StakeView = typeof StakeView.Type;

export const GroupDetail = Schema.Struct({
  group: Group,
  role: MemberRole,
  myPlayerId: PlayerId,
  players: Schema.Array(Player),
  /** Newest first. */
  trips: Schema.Array(Trip),
  unsettled: Schema.Array(Schema.Struct({ tripId: TripId, amount: MinorUnits })),
});
export type GroupDetail = typeof GroupDetail.Type;

/** A trip's sessions, oldest first and live ones included, and its own ledger of who owes whom. */
export const TripDetail = Schema.Struct({
  trip: Trip,
  sessions: Schema.Array(SessionSummary),
  balances: Schema.Array(Balance),
  transfers: Schema.Array(Transfer),
  settlements: Schema.Array(Entry),
  stakes: Schema.Array(StakeView),
});
export type TripDetail = typeof TripDetail.Type;

export const Invite = Schema.Struct({
  id: InviteId,
  groupId: GroupId,
  code: Schema.String,
  expiresAt: Schema.DateTimeUtc,
  maxUses: Schema.NullOr(Schema.Int),
  uses: Schema.Int,
  revokedAt: Schema.NullOr(Schema.DateTimeUtc),
});
export type Invite = typeof Invite.Type;

export const InvitePreview = Schema.Struct({
  groupId: GroupId,
  groupName: Schema.String,
  memberCount: Schema.Int,
  status: Schema.Literals(["open", "expired", "revoked", "used_up"]),
  alreadyMember: Schema.Boolean,
  currentTripId: Schema.NullOr(TripId),
});
export type InvitePreview = typeof InvitePreview.Type;

export const ClaimPreview = Schema.Struct({
  groupId: GroupId,
  groupName: Schema.String,
  playerId: PlayerId,
  displayName: Schema.String,
});
export type ClaimPreview = typeof ClaimPreview.Type;

const StatsBreakdown = <K extends Schema.Top>(key: K) =>
  Schema.Struct({ key, sessionCount: Schema.Int, results: Schema.Array(PlayerResult) });

/** All-time results over closed sessions; live sessions aren't settled yet. */
export const GroupStats = Schema.Struct({
  sessionCount: Schema.Int,
  minutesPlayed: Schema.Int,
  byPlayer: Schema.Array(PlayerResult),
  byGame: Schema.Array(StatsBreakdown(Game)),
  byVenue: Schema.Array(StatsBreakdown(Venue)),
  /** Results by seat: each player's session counts for the seat they held longest in it. */
  bySeat: Schema.Array(StatsBreakdown(Seat)),
  /** Each closed session's results, oldest first. */
  bySession: Schema.Array(
    Schema.Struct({
      sessionId: SessionId,
      tripId: TripId,
      venueId: VenueId,
      startedAt: Schema.DateTimeUtc,
      results: Schema.Array(PlayerResult),
    }),
  ),
});
export type GroupStats = typeof GroupStats.Type;

export const UserLimits = Schema.Struct({
  lossLimit: Schema.NullOr(MinorUnits.check(Schema.isGreaterThan(0))),
  currency: CurrencyCode,
  sessionReminderMinutes: Schema.NullOr(Schema.Literals([120, 180, 240])),
});
export type UserLimits = typeof UserLimits.Type;
