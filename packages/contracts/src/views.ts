import * as Schema from "effect/Schema";

import {
  EntryId,
  GroupId,
  InviteId,
  PlayerId,
  SessionId,
  StakeId,
  TableId,
  TripId,
  UserId,
  VenueId,
  VisitId,
} from "./ids.ts";
import { Entry, Game, Seat, Seating, Session, Stake, Trip } from "./ledger.ts";
import { CurrencyCode, MinorUnits } from "./money.ts";
import { Table } from "./recording.ts";

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
 * Everyone who can appear in the ledger. A guest carries the `claimCode` that lets them claim it;
 * a former member keeps their history with no `role` and no `claimCode`.
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

/**
 * A table in one of the group's trips, as its members see it. A table player counts as the group
 * member they're linked to; anyone else at the table is in `others`, on the table but not in
 * standings.
 */
export const TripTable = Schema.Struct({
  table: Table,
  /** Null when no casino was set, or the one recorded isn't in the catalog. */
  venue: Schema.NullOr(Venue),
  startedAt: Schema.DateTimeUtc,
  /** When the last player cashed out; null while anyone is still playing. */
  endedAt: Schema.NullOr(Schema.DateTimeUtc),
  /** Time anyone was playing, over finished visits; overlapping visits count once. */
  minutesPlayed: Schema.Int,
  /** Group members at the table, as group players, in the order they sat down. */
  playerIds: Schema.Array(PlayerId),
  /** Members still playing. */
  playing: Schema.Array(PlayerId),
  /** Members' finished visits only, so sitting back down never unsettles a cash-out. */
  results: Schema.Array(PlayerResult),
  /** What each member still playing has bought in for at their open visit. */
  inPlay: Schema.Array(Schema.Struct({ playerId: PlayerId, buyIn: MinorUnits })),
  /** Everyone else, with their finished visits' result. */
  others: Schema.Array(
    Schema.Struct({ displayName: Schema.String, playing: Schema.Boolean, net: MinorUnits }),
  ),
  /** Your latest visit here, to open; null if you didn't play. */
  myVisitId: Schema.NullOr(VisitId),
});

export type TripTable = typeof TripTable.Type;

export const SessionDetail = Schema.Struct({
  session: Session,
  importedTableId: Schema.optionalKey(TableId),
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
  /** Live sessions, and tables in its trips with anyone still playing. */
  liveSessionCount: Schema.Int,
  /** Trips in this group that currently have a live session or table. */
  liveTripIds: Schema.Array(TripId),
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

const ActivityGroup = Schema.Struct({ id: GroupId, name: Schema.String, currency: CurrencyCode });
const ActivityTrip = Schema.Struct({ id: TripId, name: Schema.String });
const ActivityPlayer = Schema.Struct({ playerId: PlayerId, displayName: Schema.String });

const ActivityTablePlayer = Schema.Struct({
  playerId: Schema.NullOr(PlayerId),
  displayName: Schema.String,
});

const ActivityTable = {
  tableId: TableId,
  venue: Schema.NullOr(Venue),
  game: Schema.NullOr(Game),
  myVisitId: Schema.NullOr(VisitId),
};

/**
 * One row of the Crew feed. A session or table appears once, as it stands now: live from when it
 * started, finished from when it closed. A table closes when its last player cashes out.
 */
export const CrewActivityItem = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("session_live"),
    group: ActivityGroup,
    trip: ActivityTrip,
    sessionId: SessionId,
    venue: Venue,
    /** Everyone seated, in the order they sat down. */
    players: Schema.Array(ActivityPlayer),
    startedAt: Schema.DateTimeUtc,
  }),
  Schema.Struct({
    kind: Schema.Literal("session_finished"),
    group: ActivityGroup,
    trip: ActivityTrip,
    sessionId: SessionId,
    venue: Venue,
    /** Everyone seated, in the order they sat down, with what they won or lost. */
    players: Schema.Array(Schema.Struct({ ...ActivityPlayer.fields, net: MinorUnits })),
    endedAt: Schema.DateTimeUtc,
  }),
  Schema.Struct({
    kind: Schema.Literal("table_live"),
    group: ActivityGroup,
    trip: ActivityTrip,
    ...ActivityTable,
    /** Group members in the order they sat down, then everyone else at the table. */
    players: Schema.Array(ActivityTablePlayer),
    startedAt: Schema.DateTimeUtc,
  }),
  Schema.Struct({
    kind: Schema.Literal("table_finished"),
    group: ActivityGroup,
    trip: ActivityTrip,
    ...ActivityTable,
    /** As on a live table, with what each won or lost. */
    players: Schema.Array(Schema.Struct({ ...ActivityTablePlayer.fields, net: MinorUnits })),
    endedAt: Schema.DateTimeUtc,
  }),
  Schema.Struct({
    kind: Schema.Literal("trip_started"),
    group: ActivityGroup,
    trip: ActivityTrip,
    startedAt: Schema.DateTimeUtc,
  }),
]);

export type CrewActivityItem = typeof CrewActivityItem.Type;

/** Newest first. Pass `nextCursor` back for older items; it's null on the last page. */
export const CrewActivityPage = Schema.Struct({
  items: Schema.Array(CrewActivityItem),
  nextCursor: Schema.NullOr(Schema.String),
});

export type CrewActivityPage = typeof CrewActivityPage.Type;

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
});

export type GroupDetail = typeof GroupDetail.Type;

/**
 * A trip's sessions and tables, oldest first and live ones included, and its own ledger of who
 * owes whom. Balances and stakes read only sessions until tables carry them.
 */
export const TripDetail = Schema.Struct({
  trip: Trip,
  sessions: Schema.Array(SessionSummary),
  tables: Schema.Array(TripTable),
  balances: Schema.Array(Balance),
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
  /** A claim is how a guest joins, so someone already in the group can't make one. */
  alreadyMember: Schema.Boolean,
});

export type ClaimPreview = typeof ClaimPreview.Type;

export const GroupSeatPlay = Schema.Struct({
  playId: Schema.Union([SessionId, TableId]),
  playerId: PlayerId,
  seat: Schema.Union([Seat, Schema.Literal("multiple")]),
  net: MinorUnits,
  milliseconds: Schema.Int,
});

export type GroupSeatPlay = typeof GroupSeatPlay.Type;

/**
 * Every finished session and table in the group's trips, oldest first; live ones aren't settled
 * yet, and play recorded only on a device never counts. Only group members' play is in `results`.
 * Standings, breakdowns and awards come from `groupStats` and `groupAwards` in
 * `@stacks/shared/stats`, so trip, game, casino and period filter on the device.
 */
export const GroupStats = Schema.Struct({
  plays: Schema.Array(
    Schema.Struct({
      id: Schema.Union([SessionId, TableId]),
      tripId: TripId,
      game: Schema.NullOr(Game),
      venueId: Schema.NullOr(VenueId),
      startedAt: Schema.DateTimeUtc,
      endedAt: Schema.DateTimeUtc,
      results: Schema.Array(
        Schema.Struct({
          playerId: PlayerId,
          buyIn: MinorUnits,
          net: MinorUnits,
          /** How long this member played at it, in milliseconds. */
          milliseconds: Schema.Int,
        }),
      ),
    }),
  ),
  /** The casinos the plays name. */
  venues: Schema.Array(Venue),
  /**
   * Visits with more than one active buy-in, one item per visit: a table merges return visits, so
   * counting per table would turn two single buy-ins into a false extra. A missing field means the
   * server didn't say, not none.
   */
  reloads: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        playId: Schema.Union([SessionId, TableId]),
        playerId: PlayerId,
        /** Active buy-ins beyond the first. */
        additional: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
        /** What the player made over this visit. */
        net: MinorUnits,
      }),
    ),
  ),
  /** How many finished visits each play has, as context for `reloads`. */
  allVisits: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        playId: Schema.Union([SessionId, TableId]),
        visits: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
      }),
    ),
  ),
  /** Active buy-ins one group player paid for another. */
  covered: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        playId: Schema.Union([SessionId, TableId]),
        payerId: PlayerId,
        playerId: PlayerId,
        amount: MinorUnits,
      }),
    ),
  ),
  /**
   * Stakes on older group sessions, oldest first, with what the borrower owes back. `final` is
   * false while the stake and its trip are both open, or a session it covers is live.
   */
  stakes: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        stakeId: StakeId,
        tripId: TripId,
        lenderId: PlayerId,
        borrowerId: PlayerId,
        amount: MinorUnits,
        owed: MinorUnits,
        final: Schema.Boolean,
      }),
    ),
  ),
  /** Finished blackjack seat outcomes per group member visit. Missing means the server didn't say. */
  seats: Schema.optionalKey(Schema.Array(GroupSeatPlay)),
});

export type GroupStats = typeof GroupStats.Type;
