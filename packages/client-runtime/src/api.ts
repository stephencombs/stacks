import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpApiClient from "effect/http-api/HttpApiClient";
import * as Predicate from "effect/Predicate";
import * as AtomHttpApi from "effect/reactivity/AtomHttpApi";
import type {
  ResolvePublicVenueRequest,
  ScopeId,
  SearchPublicVenuesQuery,
  SessionId,
  TripId,
} from "@stacks/contracts";
import type { ActorCredential } from "@stacks/contracts/recordingCommands";
import { GroupId, ORIGIN_HEADER, StacksApi, TableId, VenueId } from "@stacks/contracts";

import { newId } from "./ids.ts";
import type { RecordingTransport } from "./recordingSync.ts";

/**
 * Every query carries this key and every mutation invalidates it, so a write refreshes whatever
 * is on screen. Only mounted queries refetch, which is a handful at most.
 */
export const LEDGER_KEYS = ["stacks"] as const;

export interface StacksClientOptions {
  /** The API origin. */
  readonly baseUrl: string;
  /** The signed-in user's Clerk session token, fetched fresh for each request. */
  readonly getToken: () => Promise<string | null>;
  /** This install's id, sent as `X-Origin` so the API can tell notices it caused from others. */
  readonly origin: string;
}

const withToken = ({ getToken, origin }: Pick<StacksClientOptions, "getToken" | "origin">) =>
  HttpClient.mapRequestEffect((request) =>
    Effect.map(Effect.promise(getToken), (token) =>
      HttpClientRequest.setHeader(
        token ? HttpClientRequest.bearerToken(request, token) : request,
        ORIGIN_HEADER,
        origin,
      ),
    ),
  );

const withActor = (actor: ActorCredential, origin: string) =>
  HttpClient.mapRequest((request) =>
    HttpClientRequest.setHeader(
      HttpClientRequest.setHeader(
        request,
        "authorization",
        `Actor ${actor.actorId}.${actor.secret}`,
      ),
      ORIGIN_HEADER,
      origin,
    ),
  );

/**
 * Personal recording sync talks to the API outside the query cache: it owns its retries. Each
 * call proves the device actor when given one, and sends the account's session otherwise.
 */
export const makeRecordingTransport: (options: StacksClientOptions) => RecordingTransport = ({
  baseUrl,
  getToken,
  origin,
}: StacksClientOptions) => {
  const client = (actor: ActorCredential | null) =>
    HttpApiClient.make(StacksApi, {
      baseUrl,
      transformClient: actor ? withActor(actor, origin) : withToken({ getToken, origin }),
    }).pipe(Effect.provide(FetchHttpClient.layer));

  return {
    history: (actor) => Effect.flatMap(client(actor), (api) => api.recording.history()),
    push: (payload, actor) =>
      Effect.flatMap(client(actor), (api) => api.recording.push({ payload })),
    registerActor: (payload) =>
      Effect.flatMap(client(payload), (api) => api.publicRecording.registerActor({ payload })),
    claimActor: (payload) =>
      Effect.flatMap(client(null), (api) => api.claim.claimActor({ payload })),
    share: (tableId, actor) =>
      Effect.flatMap(client(actor), (api) => api.recording.share({ params: { tableId } })),
    unshare: (tableId, actor) =>
      Effect.flatMap(client(actor), (api) => api.recording.unshare({ params: { tableId } })),
    table: (tableId, actor) =>
      Effect.flatMap(client(actor), (api) => api.recording.table({ params: { tableId } })),
    join: (token, payload, actor) =>
      Effect.flatMap(client(actor), (api) => api.recording.join({ params: { token }, payload })),
    invitePlayer: (playerId, actor) =>
      Effect.flatMap(client(actor), (api) => api.recording.invitePlayer({ params: { playerId } })),
    playerAccess: (playerId, actor) =>
      Effect.flatMap(client(actor), (api) => api.recording.playerAccess({ params: { playerId } })),
    revokeBinding: (playerId, actorId, actor) =>
      Effect.flatMap(client(actor), (api) =>
        api.recording.revokeBinding({ params: { playerId, actorId } }),
      ),
    revokeInvite: (inviteId, actor) =>
      Effect.flatMap(client(actor), (api) => api.recording.revokeInvite({ params: { inviteId } })),
    redeemInvite: (token, payload, actor) =>
      Effect.flatMap(client(actor), (api) =>
        api.recording.redeemInvite({ params: { token }, payload }),
      ),
    searchVenues: (query) => searchPublicVenues({ baseUrl }, query),
    venue: (venueId) => fetchPublicVenue({ baseUrl }, venueId),
    resolveVenue: (payload) =>
      resolvePublicVenue({ baseUrl }, payload).pipe(
        Effect.catch(() => fallbackResolveVenue({ baseUrl, getToken, origin }, payload)),
      ),
  };
};

/** Whose play a personal invite records. Needs no account or device actor. */
export const fetchInvitePreview = (
  { baseUrl }: Pick<StacksClientOptions, "baseUrl">,
  token: string,
) =>
  HttpApiClient.make(StacksApi, { baseUrl }).pipe(
    Effect.flatMap((api) => api.publicRecording.previewInvite({ params: { token } })),
    Effect.provide(FetchHttpClient.layer),
  );

/** A table's read-only view through its share link. Needs no account or device actor. */
export const fetchSharedTable = (
  { baseUrl }: Pick<StacksClientOptions, "baseUrl">,
  token: string,
) =>
  HttpApiClient.make(StacksApi, { baseUrl }).pipe(
    Effect.flatMap((api) => api.publicRecording.shared({ params: { token } })),
    Effect.provide(FetchHttpClient.layer),
  );

export const searchPublicVenues = (
  { baseUrl }: Pick<StacksClientOptions, "baseUrl">,
  query: typeof SearchPublicVenuesQuery.Type,
) =>
  HttpApiClient.make(StacksApi, { baseUrl }).pipe(
    Effect.flatMap((api) => api.publicVenues.search({ query })),
    Effect.provide(FetchHttpClient.layer),
  );

export const fetchPublicVenue = (
  { baseUrl }: Pick<StacksClientOptions, "baseUrl">,
  venueId: VenueId,
) =>
  HttpApiClient.make(StacksApi, { baseUrl }).pipe(
    Effect.flatMap((api) => api.publicVenues.get({ params: { venueId } })),
    Effect.provide(FetchHttpClient.layer),
  );

const resolvePublicVenue = (
  { baseUrl }: Pick<StacksClientOptions, "baseUrl">,
  payload: typeof ResolvePublicVenueRequest.Type,
) =>
  HttpApiClient.make(StacksApi, { baseUrl }).pipe(
    Effect.flatMap((api) => api.publicVenues.resolve({ payload })),
    Effect.provide(FetchHttpClient.layer),
  );

const unlessRefused = <A, E, R>(check: Effect.Effect<A, E, R>) =>
  check.pipe(
    Effect.as(true),
    Effect.catch((error) =>
      Effect.succeed(
        !(
          Predicate.isTagged(error, "Unauthorized") ||
          Predicate.isTagged(error, "Forbidden") ||
          Predicate.isTagged(error, "NotFound")
        ),
      ),
    ),
  );

/**
 * Whether the API still lets the caller read the scope's view, with the same `Authorization` the
 * socket connects with: the group's for a `group:` scope, the table's for a `table:` one.
 */
export const makeScopeWatchable =
  ({
    baseUrl,
    authorization,
  }: {
    readonly baseUrl: string;
    readonly authorization: () => Promise<string | null>;
  }) =>
  (scope: ScopeId) =>
    unlessRefused(
      Effect.gen(function* () {
        const api = yield* HttpApiClient.make(StacksApi, {
          baseUrl,
          transformClient: HttpClient.mapRequestEffect((request) =>
            Effect.map(Effect.promise(authorization), (value) =>
              value ? HttpClientRequest.setHeader(request, "authorization", value) : request,
            ),
          ),
        });

        if (scope.startsWith("group:")) {
          yield* api.groups.get({
            params: { groupId: GroupId.make(scope.slice("group:".length)) },
          });
        } else {
          yield* api.recording.table({
            params: { tableId: TableId.make(scope.slice("table:".length)) },
          });
        }
      }).pipe(Effect.provide(FetchHttpClient.layer)),
    );

/** The same check for a table watched through its share link. */
export const makeSharedWatchable =
  (options: Pick<StacksClientOptions, "baseUrl">, token: string) => () =>
    unlessRefused(fetchSharedTable(options, token));

const norm = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

const fallbackResolveVenue = (
  { baseUrl, getToken, origin }: StacksClientOptions,
  payload: typeof ResolvePublicVenueRequest.Type,
) =>
  Effect.gen(function* () {
    const matches = yield* searchPublicVenues({ baseUrl }, { q: payload.name }).pipe(
      Effect.catch(() => Effect.succeed([])),
    );

    const existing = matches.find(
      (venue) =>
        norm(venue.name) === norm(payload.name) &&
        ((venue.lat !== null &&
          venue.lng !== null &&
          Math.abs(venue.lat - payload.lat) < 0.01 &&
          Math.abs(venue.lng - payload.lng) < 0.01) ||
          (norm(venue.city) === norm(payload.city) && norm(venue.region) === norm(payload.region))),
    );

    if (existing) {
      return {
        ...existing,
        lat: existing.lat ?? payload.lat,
        lng: existing.lng ?? payload.lng,
      };
    }

    const api = yield* HttpApiClient.make(StacksApi, {
      baseUrl,
      transformClient: withToken({ getToken, origin }),
    }).pipe(Effect.provide(FetchHttpClient.layer));

    const created = yield* api.venues.create({
      payload: {
        id: VenueId.make(newId()),
        name: payload.name,
        kind: "casino",
        city: payload.city,
        region: payload.region,
        country: payload.country,
        groupId: null,
      },
    });

    return {
      ...created,
      lat: created.lat ?? payload.lat,
      lng: created.lng ?? payload.lng,
    };
  });

export const makeStacksClient = ({ baseUrl, getToken, origin }: StacksClientOptions) => {
  class StacksClient extends AtomHttpApi.Service<StacksClient>()("@stacks/StacksClient", {
    api: StacksApi,
    httpClient: FetchHttpClient.layer,
    baseUrl,
    transformClient: withToken({ getToken, origin }),
  }) {}

  const keys = { reactivityKeys: LEDGER_KEYS };

  return {
    Client: StacksClient,
    groups: StacksClient.query("groups", "list", keys),
    crewActivity: (cursor?: string) =>
      StacksClient.query("crew", "activity", {
        query: cursor === undefined ? {} : { cursor },
        ...keys,
      }),
    group: (groupId: GroupId) =>
      StacksClient.query("groups", "get", { params: { groupId }, ...keys }),
    stats: (groupId: GroupId) =>
      StacksClient.query("groups", "stats", { params: { groupId }, ...keys }),
    trip: (tripId: TripId) => StacksClient.query("trips", "get", { params: { tripId }, ...keys }),
    session: (sessionId: SessionId) =>
      StacksClient.query("sessions", "get", { params: { sessionId }, ...keys }),
    invites: (groupId: GroupId) =>
      StacksClient.query("invites", "list", { params: { groupId }, ...keys }),
    accountDeletionPreview: StacksClient.query("account", "deletionPreview", keys),
    invitePreview: (code: string) =>
      StacksClient.query("invites", "preview", { params: { code }, ...keys }),
    claimPreview: (code: string) =>
      StacksClient.query("guests", "previewClaim", { params: { code }, ...keys }),
    recentVenues: (groupId: GroupId) =>
      StacksClient.query("venues", "recent", { params: { groupId }, ...keys }),
    venueSearch: (
      groupId: GroupId,
      search: {
        readonly q: string;
        readonly near?: { readonly lat: number; readonly lng: number };
      },
    ) =>
      StacksClient.query("venues", "search", {
        query: searchQuery(groupId, search),
      }),
  };
};

const searchQuery = (
  groupId: GroupId,
  search: {
    readonly q: string;
    readonly near?: { readonly lat: number; readonly lng: number };
  },
) => {
  const query = search.q ? { groupId, q: search.q } : { groupId };

  return search.near ? { ...query, lat: search.near.lat, lng: search.near.lng } : query;
};

export type Stacks = ReturnType<typeof makeStacksClient>;
