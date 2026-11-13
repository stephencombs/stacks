import * as Schema from "effect/Schema";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import * as HttpApiSchema from "effect/http-api/HttpApiSchema";
import * as OpenApi from "effect/http-api/OpenApi";

import { Authentication, RecordingAuthentication } from "./auth.ts";
import { Conflict, Forbidden, InvalidRequest, NotFound, Unauthorized } from "./errors.ts";
import {
  ActorId,
  EntryId,
  GroupId,
  InviteId,
  PlayerId,
  PlayerInviteId,
  SeatingId,
  SessionId,
  StakeId,
  TableId,
  TripId,
  UserId,
  VenueId,
} from "./ids.ts";
import { Entry, Game, Seat, Stake, Trip } from "./ledger.ts";
import { CurrencyCode, MinorUnits } from "./money.ts";
import { PlayerIdentity } from "./players.ts";
import {
  ActorCredential,
  ClaimActorRequest,
  ClaimResult,
  JoinedTable,
  JoinTableRequest,
  PlayerAccess,
  PlayerInviteLink,
  PlayerInvitePreview,
  PushRecordingRequest,
  RedeemInviteRequest,
  PushRecordingResponse,
  RecordingHistory,
  ShareLink,
  TableView,
} from "./recordingCommands.ts";
import {
  ClaimPreview,
  CrewActivityPage,
  GroupDetail,
  GroupListItem,
  GroupStats,
  Invite,
  InvitePreview,
  SessionDetail,
  TripDetail,
  Venue,
  VenueKind,
} from "./views.ts";

export const HealthResponse = Schema.Struct({
  status: Schema.Literal("ok"),
  service: Schema.Literal("stacks-api"),
});
export type HealthResponse = typeof HealthResponse.Type;

const Name = (maxLength: number) =>
  Schema.Trimmed.check(Schema.isNonEmpty(), Schema.isMaxLength(maxLength));
const Note = Schema.String.check(Schema.isMaxLength(280));

export const CreateGroupRequest = Schema.Struct({
  id: GroupId,
  name: Name(80),
  currency: CurrencyCode,
  /** The creator's name inside this group. */
  displayName: Name(60),
});

export const SetRoleRequest = Schema.Struct({ role: Schema.Literals(["admin", "member"]) });

export const CreateInviteRequest = Schema.Struct({
  id: InviteId,
  maxUses: Schema.NullOr(Schema.Int.check(Schema.isGreaterThan(0))),
});

export const AcceptInviteRequest = Schema.Struct({ displayName: Name(60) });

export const AddGuestRequest = Schema.Struct({ id: PlayerId, displayName: Name(60) });

export const SearchVenuesQuery = Schema.Struct({
  q: Schema.optionalKey(Schema.String),
  groupId: Schema.optionalKey(GroupId),
  lat: Schema.optionalKey(Schema.FiniteFromString),
  lng: Schema.optionalKey(Schema.FiniteFromString),
});

export const CreateVenueRequest = Schema.Struct({
  id: VenueId,
  name: Name(80),
  kind: VenueKind,
  city: Schema.NullOr(Name(80)),
  region: Schema.NullOr(Name(80)),
  country: Schema.NullOr(Schema.String.check(Schema.isPattern(/^[A-Z]{2}$/))),
  /** Required for a home venue, which stays private to this group. */
  groupId: Schema.NullOr(GroupId),
});

export const CreateSessionRequest = Schema.Struct({
  id: SessionId,
  venueId: VenueId,
  game: Game,
  startedAt: Schema.optionalKey(Schema.DateTimeUtc),
  playerIds: Schema.NonEmptyArray(PlayerId),
  notes: Schema.NullOr(Schema.String.check(Schema.isMaxLength(1000))),
  highLimit: Schema.optionalKey(Schema.Boolean),
});

export const CloseSessionRequest = Schema.Struct({
  endedAt: Schema.optionalKey(Schema.DateTimeUtc),
  /**
   * What everyone still playing left with, recorded in the same write as the close, so a table
   * closes in one request. Zero is a bust.
   */
  cashOuts: Schema.optionalKey(
    Schema.Array(Schema.Struct({ id: EntryId, playerId: PlayerId, amount: MinorUnits })),
  ),
});

export const AddEntryRequest = Schema.Struct({
  id: EntryId,
  kind: Schema.Literals(["buy_in", "cash_out", "adjustment"]),
  playerId: PlayerId,
  counterpartyId: Schema.NullOr(PlayerId),
  amount: MinorUnits,
  occurredAt: Schema.optionalKey(Schema.DateTimeUtc),
  note: Schema.NullOr(Note),
  /** Voids this entry in the same write, which is how an entry gets corrected. */
  replacesEntryId: Schema.NullOr(EntryId),
});

export const VoidEntryRequest = Schema.Struct({ reason: Schema.NullOr(Note) });

export const MoveSessionRequest = Schema.Struct({ tripId: TripId });

export const TableRequest = Schema.Struct({ seats: Seat });

export const HighLimitRequest = Schema.Struct({ highLimit: Schema.Boolean });

export const SeatRequest = Schema.Struct({
  id: SeatingId,
  playerId: PlayerId,
  /** Null stands the player up. */
  seat: Schema.NullOr(Seat),
  occurredAt: Schema.optionalKey(Schema.DateTimeUtc),
});

export const CreateStakeRequest = Schema.Struct({
  id: StakeId,
  lenderId: PlayerId,
  borrowerId: PlayerId,
  amount: MinorUnits.check(Schema.isGreaterThan(0)),
  /** The lender's cut of the borrower's winnings, in percent. */
  lenderShare: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
  startedAt: Schema.optionalKey(Schema.DateTimeUtc),
  note: Schema.NullOr(Note),
});

export const EndStakeRequest = Schema.Struct({ endedAt: Schema.optionalKey(Schema.DateTimeUtc) });

export const CreateTripRequest = Schema.Struct({
  id: TripId,
  name: Name(60),
  /** Defaults to now. Earlier times pick up sessions already played. */
  startedAt: Schema.optionalKey(Schema.DateTimeUtc),
});

export const EndTripRequest = Schema.Struct({ endedAt: Schema.optionalKey(Schema.DateTimeUtc) });

const groupParams = Schema.Struct({ groupId: GroupId });
const sessionParams = Schema.Struct({ sessionId: SessionId });
const Ok = Schema.Struct({ ok: Schema.Literal(true) });
const CsvText = Schema.String.pipe(
  HttpApiSchema.asText({ contentType: "text/csv; charset=utf-8" }),
);

const HealthGroup = HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("health", "/health", { success: HealthResponse }).annotate(
    OpenApi.Summary,
    "Check API health",
  ),
);

const GroupsGroup = HttpApiGroup.make("groups")
  .add(HttpApiEndpoint.get("list", "/groups", { success: Schema.Array(GroupListItem) }))
  .add(
    HttpApiEndpoint.post("create", "/groups", {
      payload: CreateGroupRequest,
      success: GroupDetail,
      error: Conflict,
    }),
  )
  .add(
    HttpApiEndpoint.get("get", "/groups/:groupId", {
      params: groupParams,
      success: GroupDetail,
      error: [Forbidden, NotFound],
    }),
  )
  .add(
    HttpApiEndpoint.get("stats", "/groups/:groupId/stats", {
      params: groupParams,
      success: GroupStats,
      error: [Forbidden, NotFound],
    }),
  )
  .add(
    HttpApiEndpoint.get("exportCsv", "/groups/:groupId/export.csv", {
      params: groupParams,
      success: CsvText,
      error: [Forbidden, NotFound],
    }),
  )
  .add(
    HttpApiEndpoint.post("leave", "/groups/:groupId/leave", {
      params: groupParams,
      success: Ok,
      error: [Forbidden, NotFound, Conflict],
    }),
  )
  .add(
    HttpApiEndpoint.post("removeMember", "/groups/:groupId/members/:userId/remove", {
      params: Schema.Struct({ groupId: GroupId, userId: UserId }),
      success: Ok,
      error: [Forbidden, NotFound, Conflict],
    }),
  )
  .add(
    HttpApiEndpoint.post("setRole", "/groups/:groupId/members/:userId/role", {
      params: Schema.Struct({ groupId: GroupId, userId: UserId }),
      payload: SetRoleRequest,
      success: Ok,
      error: [Forbidden, NotFound, Conflict],
    }),
  )
  .middleware(Authentication);

export const CrewActivityQuery = Schema.Struct({ cursor: Schema.optionalKey(Schema.String) });

/** Activity across every group the caller is in, for the Crew tab. */
const CrewGroup = HttpApiGroup.make("crew")
  .add(
    HttpApiEndpoint.get("activity", "/crew/activity", {
      query: CrewActivityQuery,
      success: CrewActivityPage,
      error: InvalidRequest,
    }),
  )
  .middleware(Authentication);

const InvitesGroup = HttpApiGroup.make("invites")
  .add(
    HttpApiEndpoint.post("create", "/groups/:groupId/invites", {
      params: groupParams,
      payload: CreateInviteRequest,
      success: Invite,
      error: [Forbidden, NotFound, Conflict],
    }),
  )
  .add(
    HttpApiEndpoint.get("list", "/groups/:groupId/invites", {
      params: groupParams,
      success: Schema.Array(Invite),
      error: [Forbidden, NotFound],
    }),
  )
  .add(
    HttpApiEndpoint.post("revoke", "/invites/:inviteId/revoke", {
      params: Schema.Struct({ inviteId: InviteId }),
      success: Ok,
      error: [Forbidden, NotFound],
    }),
  )
  .add(
    HttpApiEndpoint.get("preview", "/invites/by-code/:code", {
      params: Schema.Struct({ code: Schema.String }),
      success: InvitePreview,
      error: NotFound,
    }),
  )
  .add(
    HttpApiEndpoint.post("accept", "/invites/by-code/:code/accept", {
      params: Schema.Struct({ code: Schema.String }),
      payload: AcceptInviteRequest,
      success: GroupDetail,
      error: [NotFound, Conflict],
    }),
  )
  .middleware(Authentication);

const GuestsGroup = HttpApiGroup.make("guests")
  .add(
    HttpApiEndpoint.post("add", "/groups/:groupId/guests", {
      params: groupParams,
      payload: AddGuestRequest,
      success: GroupDetail,
      error: [Forbidden, NotFound, Conflict],
    }),
  )
  .add(
    HttpApiEndpoint.get("previewClaim", "/claims/:code", {
      params: Schema.Struct({ code: Schema.String }),
      success: ClaimPreview,
      error: NotFound,
    }),
  )
  .add(
    HttpApiEndpoint.post("claim", "/claims/:code/accept", {
      params: Schema.Struct({ code: Schema.String }),
      success: GroupDetail,
      error: [NotFound, Conflict],
    }),
  )
  .middleware(Authentication);

const VenuesGroup = HttpApiGroup.make("venues")
  .add(
    HttpApiEndpoint.get("search", "/venues", {
      query: SearchVenuesQuery,
      success: Schema.Array(Venue),
      error: [Forbidden, NotFound],
    }),
  )
  .add(
    HttpApiEndpoint.get("recent", "/groups/:groupId/venues/recent", {
      params: groupParams,
      success: Schema.Array(Venue),
      error: [Forbidden, NotFound],
    }),
  )
  .add(
    HttpApiEndpoint.post("create", "/venues", {
      payload: CreateVenueRequest,
      success: Venue,
      error: [Forbidden, NotFound, InvalidRequest],
    }),
  )
  .middleware(Authentication);

const tripParams = Schema.Struct({ tripId: TripId });

const SessionsGroup = HttpApiGroup.make("sessions")
  .add(
    HttpApiEndpoint.post("create", "/trips/:tripId/sessions", {
      params: tripParams,
      payload: CreateSessionRequest,
      success: SessionDetail,
      error: [Forbidden, NotFound, Conflict],
    }),
  )
  .add(
    HttpApiEndpoint.get("get", "/sessions/:sessionId", {
      params: sessionParams,
      success: SessionDetail,
      error: [Forbidden, NotFound],
    }),
  )
  .add(
    HttpApiEndpoint.post("addPlayer", "/sessions/:sessionId/players", {
      params: sessionParams,
      payload: Schema.Struct({ playerId: PlayerId }),
      success: SessionDetail,
      error: [Forbidden, NotFound, Conflict],
    }),
  )
  .add(
    HttpApiEndpoint.post("seat", "/sessions/:sessionId/seatings", {
      params: sessionParams,
      payload: SeatRequest,
      success: SessionDetail,
      error: [Forbidden, NotFound, Conflict, InvalidRequest],
    }),
  )
  .add(
    HttpApiEndpoint.post("setTable", "/sessions/:sessionId/table", {
      params: sessionParams,
      payload: TableRequest,
      success: SessionDetail,
      error: [Forbidden, NotFound, Conflict, InvalidRequest],
    }),
  )
  .add(
    HttpApiEndpoint.post("setHighLimit", "/sessions/:sessionId/high-limit", {
      params: sessionParams,
      payload: HighLimitRequest,
      success: SessionDetail,
      error: [Forbidden, NotFound],
    }),
  )
  .add(
    HttpApiEndpoint.post("close", "/sessions/:sessionId/close", {
      params: sessionParams,
      payload: CloseSessionRequest,
      success: SessionDetail,
      error: [Forbidden, NotFound, Conflict, InvalidRequest],
    }),
  )
  .add(
    HttpApiEndpoint.post("reopen", "/sessions/:sessionId/reopen", {
      params: sessionParams,
      success: SessionDetail,
      error: [Forbidden, NotFound, Conflict],
    }),
  )
  .add(
    HttpApiEndpoint.post("move", "/sessions/:sessionId/trip", {
      params: sessionParams,
      payload: MoveSessionRequest,
      success: SessionDetail,
      error: [Forbidden, NotFound, Conflict],
    }),
  )
  .middleware(Authentication);

const LedgerGroup = HttpApiGroup.make("ledger")
  .add(
    HttpApiEndpoint.post("addEntry", "/sessions/:sessionId/entries", {
      params: sessionParams,
      payload: AddEntryRequest,
      success: Entry,
      error: [Forbidden, NotFound, Conflict, InvalidRequest],
    }),
  )
  .add(
    HttpApiEndpoint.post("voidEntry", "/entries/:entryId/void", {
      params: Schema.Struct({ entryId: EntryId }),
      payload: VoidEntryRequest,
      success: Entry,
      error: [Forbidden, NotFound, Conflict, InvalidRequest],
    }),
  )
  .middleware(Authentication);

const stakeParams = Schema.Struct({ stakeId: StakeId });

const StakesGroup = HttpApiGroup.make("stakes")
  .add(
    HttpApiEndpoint.post("create", "/trips/:tripId/stakes", {
      params: tripParams,
      payload: CreateStakeRequest,
      success: Stake,
      error: [Forbidden, NotFound, Conflict, InvalidRequest],
    }),
  )
  .add(
    HttpApiEndpoint.post("end", "/stakes/:stakeId/end", {
      params: stakeParams,
      payload: EndStakeRequest,
      success: Stake,
      error: [Forbidden, NotFound, Conflict, InvalidRequest],
    }),
  )
  .add(
    HttpApiEndpoint.post("reopen", "/stakes/:stakeId/reopen", {
      params: stakeParams,
      success: Stake,
      error: [Forbidden, NotFound, Conflict],
    }),
  )
  .add(
    HttpApiEndpoint.post("void", "/stakes/:stakeId/void", {
      params: stakeParams,
      payload: VoidEntryRequest,
      success: Stake,
      error: [Forbidden, NotFound, Conflict],
    }),
  )
  .middleware(Authentication);

const TripsGroup = HttpApiGroup.make("trips")
  .add(
    HttpApiEndpoint.post("create", "/groups/:groupId/trips", {
      params: groupParams,
      payload: CreateTripRequest,
      success: Trip,
      error: [Forbidden, NotFound, Conflict, InvalidRequest],
    }),
  )
  .add(
    HttpApiEndpoint.get("get", "/trips/:tripId", {
      params: tripParams,
      success: TripDetail,
      error: [Forbidden, NotFound],
    }),
  )
  .add(
    HttpApiEndpoint.post("end", "/trips/:tripId/end", {
      params: tripParams,
      payload: EndTripRequest,
      success: Trip,
      error: [Forbidden, NotFound, Conflict, InvalidRequest],
    }),
  )
  .add(
    HttpApiEndpoint.post("reopen", "/trips/:tripId/reopen", {
      params: tripParams,
      success: Trip,
      error: [Forbidden, NotFound, Conflict],
    }),
  )
  .add(
    HttpApiEndpoint.post("delete", "/trips/:tripId/delete", {
      params: tripParams,
      success: Trip,
      error: [Forbidden, NotFound, Conflict],
    }),
  )
  .middleware(Authentication);

const tableParams = Schema.Struct({ tableId: TableId });
const playerParams = Schema.Struct({ playerId: PlayerId });

/** An account's session or a device actor's credential. Tables it isn't at are 404s. */
const RecordingGroup = HttpApiGroup.make("recording")
  .add(
    HttpApiEndpoint.get("history", "/recording", {
      success: RecordingHistory,
      error: Unauthorized,
    }).annotate(
      OpenApi.Summary,
      "The visits, entries and applied commands at the tables this recorder started",
    ),
  )
  .add(
    HttpApiEndpoint.post("push", "/recording/commands", {
      payload: PushRecordingRequest,
      success: PushRecordingResponse,
      error: [Conflict, Unauthorized],
    }).annotate(
      OpenApi.Summary,
      "Applies commands in order; a retried operation with the same content is a no-op",
    ),
  )
  .add(
    HttpApiEndpoint.get("table", "/tables/:tableId", {
      params: tableParams,
      success: TableView,
      error: [NotFound, Unauthorized],
    }),
  )
  .add(
    HttpApiEndpoint.post("share", "/tables/:tableId/share", {
      params: tableParams,
      success: ShareLink,
      error: [Forbidden, NotFound, Unauthorized],
    }).annotate(OpenApi.Summary, "A new read-only link; any earlier link stops working"),
  )
  .add(
    HttpApiEndpoint.delete("unshare", "/tables/:tableId/share", {
      params: tableParams,
      success: HttpApiSchema.NoContent,
      error: [Forbidden, NotFound, Unauthorized],
    }),
  )
  .add(
    HttpApiEndpoint.post("join", "/shared/:token/join", {
      params: Schema.Struct({ token: Schema.String }),
      payload: JoinTableRequest,
      success: JoinedTable,
      error: [Conflict, NotFound, Unauthorized],
    }).annotate(
      OpenApi.Summary,
      "Joins the linked table as a new player who records only their own play",
    ),
  )
  .add(
    HttpApiEndpoint.post("invitePlayer", "/players/:playerId/invites", {
      params: playerParams,
      success: PlayerInviteLink,
      error: [Forbidden, NotFound, Unauthorized],
    }).annotate(
      OpenApi.Summary,
      "A single-use link that lets another device record as this player; earlier ones stop working",
    ),
  )
  .add(
    HttpApiEndpoint.get("playerAccess", "/players/:playerId/access", {
      params: playerParams,
      success: PlayerAccess,
      error: [Forbidden, NotFound, Unauthorized],
    }),
  )
  .add(
    HttpApiEndpoint.delete("revokeBinding", "/players/:playerId/actors/:actorId", {
      params: Schema.Struct({ playerId: PlayerId, actorId: ActorId }),
      success: HttpApiSchema.NoContent,
      error: [Forbidden, NotFound, Unauthorized],
    }).annotate(OpenApi.Summary, "Stops a device recording as this player"),
  )
  .add(
    HttpApiEndpoint.delete("revokeInvite", "/player-invites/:inviteId", {
      params: Schema.Struct({ inviteId: PlayerInviteId }),
      success: HttpApiSchema.NoContent,
      error: [Forbidden, NotFound, Unauthorized],
    }),
  )
  .add(
    HttpApiEndpoint.post("redeemInvite", "/invites/:token/redeem", {
      params: Schema.Struct({ token: Schema.String }),
      payload: RedeemInviteRequest,
      success: PlayerIdentity,
      error: [Conflict, NotFound, Unauthorized],
    }).annotate(OpenApi.Summary, "Records as the invited player from now on"),
  )
  .middleware(RecordingAuthentication);

/** Device actors register themselves, and share links are read without signing in. */
const PublicRecordingGroup = HttpApiGroup.make("publicRecording")
  .add(
    HttpApiEndpoint.post("registerActor", "/actors", {
      payload: ActorCredential,
      success: HttpApiSchema.NoContent,
      error: Conflict,
    }),
  )
  .add(
    HttpApiEndpoint.get("shared", "/shared/:token", {
      params: Schema.Struct({ token: Schema.String }),
      success: TableView,
      error: NotFound,
    }),
  )
  .add(
    HttpApiEndpoint.get("previewInvite", "/invites/:token", {
      params: Schema.Struct({ token: Schema.String }),
      success: PlayerInvitePreview,
      error: [Conflict, NotFound],
    }),
  );

/** Signing in on a device that already synced as its actor keeps that player as the account's. */
const ClaimGroup = HttpApiGroup.make("claim")
  .add(
    HttpApiEndpoint.post("claimActor", "/recording/claim", {
      payload: ClaimActorRequest,
      success: ClaimResult,
      error: [Conflict, Unauthorized],
    }),
  )
  .middleware(Authentication);

export class StacksApi extends HttpApi.make("stacks")
  .add(HealthGroup)
  .add(GroupsGroup)
  .add(CrewGroup)
  .add(InvitesGroup)
  .add(GuestsGroup)
  .add(VenuesGroup)
  .add(SessionsGroup)
  .add(LedgerGroup)
  .add(StakesGroup)
  .add(TripsGroup)
  .add(RecordingGroup)
  .add(PublicRecordingGroup)
  .add(ClaimGroup)
  .prefix("/api") {}
