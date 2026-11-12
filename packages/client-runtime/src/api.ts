import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpApiClient from "effect/http-api/HttpApiClient";
import * as AtomHttpApi from "effect/reactivity/AtomHttpApi";
import type { GroupId, PlayerId, SessionId, TripId } from "@stacks/contracts";
import type { ActorCredential } from "@stacks/contracts/recordingCommands";
import { StacksApi } from "@stacks/contracts";

import type { RecordingTransport } from "./recordingSync.ts";

/**
 * Every query carries this key and every mutation invalidates it, so a write refreshes whatever
 * is on screen. Only mounted queries refetch, which is a handful at most.
 */
export const LEDGER_KEYS = ["stacks"] as const;

export interface StacksClientOptions {
  /** "" for same-origin web; the API origin on mobile. */
  readonly baseUrl: string;
  /** The signed-in user's Clerk session token, fetched fresh for each request. */
  readonly getToken: () => Promise<string | null>;
}

const withToken = (getToken: StacksClientOptions["getToken"]) =>
  HttpClient.mapRequestEffect((request) =>
    Effect.map(Effect.promise(getToken), (token) =>
      token ? HttpClientRequest.bearerToken(request, token) : request,
    ),
  );

const withActor = (actor: ActorCredential) =>
  HttpClient.mapRequest((request) =>
    HttpClientRequest.setHeader(request, "authorization", `Actor ${actor.actorId}.${actor.secret}`),
  );

/**
 * Personal recording sync talks to the API outside the query cache: it owns its retries. Each
 * call proves the device actor when given one, and sends the account's session otherwise.
 */
export const makeRecordingTransport = ({
  baseUrl,
  getToken,
}: StacksClientOptions): RecordingTransport => {
  const client = (actor: ActorCredential | null) =>
    HttpApiClient.make(StacksApi, {
      baseUrl,
      transformClient: actor ? withActor(actor) : withToken(getToken),
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
    balances: (actor) => Effect.flatMap(client(actor), (api) => api.recording.balances()),
    pair: (playerId, actor) =>
      Effect.flatMap(client(actor), (api) => api.recording.pair({ params: { playerId } })),
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

export const makeStacksClient = ({ baseUrl, getToken }: StacksClientOptions) => {
  class StacksClient extends AtomHttpApi.Service<StacksClient>()("@stacks/StacksClient", {
    api: StacksApi,
    httpClient: FetchHttpClient.layer,
    baseUrl,
    transformClient: withToken(getToken),
  }) {}

  const keys = { reactivityKeys: LEDGER_KEYS };
  return {
    Client: StacksClient,
    limits: (tripId: TripId) =>
      StacksClient.query("limits", "get", { params: { tripId }, ...keys }),
    groups: StacksClient.query("groups", "list", keys),
    group: (groupId: GroupId) =>
      StacksClient.query("groups", "get", { params: { groupId }, ...keys }),
    stats: (groupId: GroupId) =>
      StacksClient.query("groups", "stats", { params: { groupId }, ...keys }),
    trip: (tripId: TripId) => StacksClient.query("trips", "get", { params: { tripId }, ...keys }),
    balance: (tripId: TripId, playerId: PlayerId) =>
      StacksClient.query("trips", "balance", { params: { tripId, playerId }, ...keys }),
    session: (sessionId: SessionId) =>
      StacksClient.query("sessions", "get", { params: { sessionId }, ...keys }),
    invites: (groupId: GroupId) =>
      StacksClient.query("invites", "list", { params: { groupId }, ...keys }),
    invitePreview: (code: string) =>
      StacksClient.query("invites", "preview", { params: { code }, ...keys }),
    claimPreview: (code: string) =>
      StacksClient.query("guests", "previewClaim", { params: { code }, ...keys }),
    recentVenues: (groupId: GroupId) =>
      StacksClient.query("venues", "recent", { params: { groupId }, ...keys }),
    /** Catalog and home venues matching `q`, or the nearest to `near` when `q` is empty. */
    venueSearch: (
      groupId: GroupId,
      search: {
        readonly q: string;
        readonly near?: { readonly lat: number; readonly lng: number };
      },
    ) =>
      StacksClient.query("venues", "search", {
        query: {
          groupId,
          ...(search.q ? { q: search.q } : {}),
          ...(search.near ? { lat: search.near.lat, lng: search.near.lng } : {}),
        },
      }),
  };
};

export type Stacks = ReturnType<typeof makeStacksClient>;
