import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";
import {
  EntryId,
  EntryKind,
  Game,
  GroupId,
  InviteId,
  MemberRole,
  MinorUnits,
  PaymentHandles,
  PlayerId,
  Seat,
  SeatingId,
  SessionId,
  SessionStatus,
  StakeId,
  TripId,
  CurrencyCode,
  UserId,
  VenueId,
  VenueKind,
} from "@stacks/contracts";

/** Postgres returns `timestamptz` as a Date. */
const Timestamp = Schema.DateTimeUtcFromDate;

/** Postgres returns `bigint` as a JS bigint; `MinorUnits` rejects anything past 2^53. */
const Amount = Schema.BigInt.pipe(
  Schema.decodeTo(
    MinorUnits,
    SchemaTransformation.transform({ decode: (n) => Number(n), encode: (n) => BigInt(n) }),
  ),
);

export const GroupRow = Schema.Struct({
  id: GroupId,
  name: Schema.String,
  currency: CurrencyCode,
  createdAt: Timestamp,
});

export const MembershipRow = Schema.Struct({
  groupId: GroupId,
  role: MemberRole,
  playerId: PlayerId,
});

export const PlayerRow = Schema.Struct({
  id: PlayerId,
  displayName: Schema.String,
  userId: Schema.NullOr(UserId),
  role: Schema.NullOr(MemberRole),
  claimCode: Schema.NullOr(Schema.String),
  ...PaymentHandles.fields,
});

export const InviteRow = Schema.Struct({
  id: InviteId,
  groupId: GroupId,
  code: Schema.String,
  expiresAt: Timestamp,
  maxUses: Schema.NullOr(Schema.Int),
  uses: Schema.Int,
  revokedAt: Schema.NullOr(Timestamp),
});

export const VenueRow = Schema.Struct({
  id: VenueId,
  name: Schema.String,
  kind: VenueKind,
  city: Schema.NullOr(Schema.String),
  region: Schema.NullOr(Schema.String),
  country: Schema.NullOr(Schema.String),
  lat: Schema.NullOr(Schema.Finite),
  lng: Schema.NullOr(Schema.Finite),
  verified: Schema.Boolean,
  groupId: Schema.NullOr(GroupId),
});

export const SessionRow = Schema.Struct({
  id: SessionId,
  groupId: GroupId,
  tripId: TripId,
  venueId: VenueId,
  game: Game,
  status: SessionStatus,
  startedAt: Timestamp,
  endedAt: Schema.NullOr(Timestamp),
  notes: Schema.NullOr(Schema.String),
  tableSeats: Schema.NullOr(Seat),
  highLimit: Schema.Boolean,
});

export const SeatingRow = Schema.Struct({
  id: SeatingId,
  sessionId: SessionId,
  playerId: PlayerId,
  seat: Schema.NullOr(Seat),
  occurredAt: Timestamp,
});

export const EntryRow = Schema.Struct({
  id: EntryId,
  groupId: GroupId,
  sessionId: Schema.NullOr(SessionId),
  tripId: Schema.NullOr(TripId),
  kind: EntryKind,
  playerId: PlayerId,
  counterpartyId: Schema.NullOr(PlayerId),
  amount: Amount,
  occurredAt: Timestamp,
  note: Schema.NullOr(Schema.String),
  createdBy: UserId,
  createdAt: Timestamp,
  voidedAt: Schema.NullOr(Timestamp),
  voidedBy: Schema.NullOr(UserId),
  voidReason: Schema.NullOr(Schema.String),
  replacesEntryId: Schema.NullOr(EntryId),
});

export const StakeRow = Schema.Struct({
  id: StakeId,
  groupId: GroupId,
  tripId: TripId,
  lenderId: PlayerId,
  borrowerId: PlayerId,
  amount: Amount,
  lenderShare: Schema.Int,
  startedAt: Timestamp,
  endedAt: Schema.NullOr(Timestamp),
  note: Schema.NullOr(Schema.String),
  createdBy: UserId,
  createdAt: Timestamp,
  voidedAt: Schema.NullOr(Timestamp),
  voidedBy: Schema.NullOr(UserId),
  voidReason: Schema.NullOr(Schema.String),
});

export const TripRow = Schema.Struct({
  id: TripId,
  groupId: GroupId,
  name: Schema.String,
  startedAt: Timestamp,
  endedAt: Schema.NullOr(Timestamp),
  createdBy: UserId,
  createdAt: Timestamp,
});

export const UserLimitsRow = Schema.Struct({
  lossLimit: Schema.NullOr(Amount),
  currency: CurrencyCode,
  sessionReminderMinutes: Schema.NullOr(Schema.Literals([120, 180, 240])),
});
