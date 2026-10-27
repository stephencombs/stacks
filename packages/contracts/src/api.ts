import * as Schema from "effect/Schema";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import * as OpenApi from "effect/http-api/OpenApi";

import { Authentication } from "./auth.ts";
import { Conflict, Forbidden, InvalidRequest, NotFound } from "./errors.ts";
import { EntryId, GroupId, InviteId, PlayerId, SessionId, UserId, VenueId } from "./ids.ts";
import { Entry, Game } from "./ledger.ts";
import { CurrencyCode, MinorUnits } from "./money.ts";
import {
  ClaimPreview,
  GroupDetail,
  GroupListItem,
  Invite,
  InvitePreview,
  SessionDetail,
  SessionSummary,
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
});

export const ListSessionsQuery = Schema.Struct({
  before: Schema.optionalKey(Schema.DateTimeUtcFromString),
});

export const CloseSessionRequest = Schema.Struct({
  endedAt: Schema.optionalKey(Schema.DateTimeUtc),
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

export const RecordSettlementRequest = Schema.Struct({
  id: EntryId,
  fromPlayerId: PlayerId,
  toPlayerId: PlayerId,
  amount: MinorUnits.check(Schema.isGreaterThan(0)),
  occurredAt: Schema.optionalKey(Schema.DateTimeUtc),
  note: Schema.NullOr(Note),
});

const groupParams = Schema.Struct({ groupId: GroupId });
const sessionParams = Schema.Struct({ sessionId: SessionId });
const Ok = Schema.Struct({ ok: Schema.Literal(true) });

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

const SessionsGroup = HttpApiGroup.make("sessions")
  .add(
    HttpApiEndpoint.get("list", "/groups/:groupId/sessions", {
      params: groupParams,
      query: ListSessionsQuery,
      success: Schema.Array(SessionSummary),
      error: [Forbidden, NotFound],
    }),
  )
  .add(
    HttpApiEndpoint.post("create", "/groups/:groupId/sessions", {
      params: groupParams,
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
  .add(
    HttpApiEndpoint.post("recordSettlement", "/groups/:groupId/settlements", {
      params: groupParams,
      payload: RecordSettlementRequest,
      success: Entry,
      error: [Forbidden, NotFound, Conflict, InvalidRequest],
    }),
  )
  .middleware(Authentication);

export class StacksApi extends HttpApi.make("stacks")
  .add(HealthGroup)
  .add(GroupsGroup)
  .add(InvitesGroup)
  .add(GuestsGroup)
  .add(VenuesGroup)
  .add(SessionsGroup)
  .add(LedgerGroup)
  .prefix("/api") {}
