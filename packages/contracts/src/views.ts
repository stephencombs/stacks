import * as Schema from "effect/Schema";

import { GroupId, InviteId, PlayerId, SessionId, UserId, VenueId } from "./ids.ts";
import { Entry, Game, Session, Stake, Trip } from "./ledger.ts";
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

/**
 * Everyone who can appear in the ledger. A guest has no `userId` and carries the code that lets
 * them claim it; a member who left keeps their history and has no `role`.
 */
export const Player = Schema.Struct({
  id: PlayerId,
  displayName: Schema.String,
  userId: Schema.NullOr(UserId),
  role: Schema.NullOr(MemberRole),
  claimCode: Schema.NullOr(Schema.String),
});
export type Player = typeof Player.Type;

export const Balance = Schema.Struct({ playerId: PlayerId, amount: MinorUnits });
export type Balance = typeof Balance.Type;

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
  results: Schema.Array(PlayerResult),
});
export type SessionSummary = typeof SessionSummary.Type;

export const SessionDetail = Schema.Struct({
  session: Session,
  venue: Venue,
  playerIds: Schema.Array(PlayerId),
  results: Schema.Array(PlayerResult),
  entries: Schema.Array(Entry),
});
export type SessionDetail = typeof SessionDetail.Type;

export const GroupListItem = Schema.Struct({
  group: Group,
  role: MemberRole,
  myPlayerId: PlayerId,
  myBalance: MinorUnits,
  liveSessionCount: Schema.Int,
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
  balances: Schema.Array(Balance),
  transfers: Schema.Array(Transfer),
  settlements: Schema.Array(Entry),
  stakes: Schema.Array(StakeView),
  /** Newest first. */
  trips: Schema.Array(Trip),
  sessions: Schema.Array(SessionSummary),
});
export type GroupDetail = typeof GroupDetail.Type;

/** A trip and every session that started during it, oldest first, live ones included. */
export const TripDetail = Schema.Struct({
  trip: Trip,
  sessions: Schema.Array(SessionSummary),
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
  /** Each closed session's results, oldest first. */
  bySession: Schema.Array(
    Schema.Struct({
      sessionId: SessionId,
      startedAt: Schema.DateTimeUtc,
      results: Schema.Array(PlayerResult),
    }),
  ),
});
export type GroupStats = typeof GroupStats.Type;
