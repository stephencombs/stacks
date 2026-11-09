import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpApiClient from "effect/http-api/HttpApiClient";
import * as AtomHttpApi from "effect/reactivity/AtomHttpApi";
import type { GroupId, SessionId, TripId } from "@stacks/contracts";
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

/** Personal recording sync talks to the API outside the query cache: it owns its retries. */
export const makeRecordingTransport = ({
  baseUrl,
  getToken,
}: StacksClientOptions): RecordingTransport => {
  const client = HttpApiClient.make(StacksApi, {
    baseUrl,
    transformClient: withToken(getToken),
  }).pipe(Effect.provide(FetchHttpClient.layer));
  return {
    history: Effect.flatMap(client, (api) => api.recording.history()),
    push: (payload) => Effect.flatMap(client, (api) => api.recording.push({ payload })),
  };
};

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
