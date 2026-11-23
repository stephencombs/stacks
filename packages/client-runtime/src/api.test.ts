import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import {
  ActorId,
  GroupId,
  NotFound,
  PlayerId,
  TableId,
  Venue,
  VenueId,
  groupScope,
  tableScope,
} from "@stacks/contracts";
import * as Schema from "effect/Schema";
import { RecordingCommand, RecordingOperationId } from "@stacks/contracts/recordingCommands";

import {
  fetchPublicVenue,
  makeRecordingTransport,
  makeScopeWatchable,
  makeSharedWatchable,
  searchPublicVenues,
} from "./api.ts";

const options = { baseUrl: "https://colorup.test" };

const venue = Venue.make({
  id: VenueId.make(crypto.randomUUID()),
  name: "Casino & Resort",
  kind: "casino",
  city: "Las Vegas",
  region: "NV",
  country: "US",
  lat: 36.12,
  lng: -115.17,
  verified: true,
  groupId: null,
});

it.effect("searches public venues by name and location without credentials", () =>
  Effect.gen(function* () {
    for (const query of [{ q: venue.name }, { lat: venue.lat!, lng: venue.lng! }]) {
      const found = yield* searchPublicVenues(options, query).pipe(
        Effect.provideService(FetchHttpClient.Fetch, async (input, init) => {
          const request = new Request(input, init);
          const url = new URL(request.url);
          expect(request.method).toBe("GET");
          expect(request.headers.has("authorization")).toBe(false);
          expect(url.pathname).toBe("/api/public/venues");
          expect(Object.fromEntries(url.searchParams)).toEqual(
            Object.fromEntries(Object.entries(query).map(([key, value]) => [key, String(value)])),
          );

          return Response.json([venue]);
        }),
      );

      expect(found).toEqual([venue]);
    }
  }),
);

it.effect("reads a public venue by id without credentials", () =>
  Effect.gen(function* () {
    const found = yield* fetchPublicVenue(options, venue.id).pipe(
      Effect.provideService(FetchHttpClient.Fetch, async (input, init) => {
        const request = new Request(input, init);
        expect(request.method).toBe("GET");
        expect(request.headers.has("authorization")).toBe(false);
        expect(request.url).toBe(`${options.baseUrl}/api/public/venues/${venue.id}`);

        return Response.json(venue);
      }),
    );

    expect(found).toEqual(venue);
  }),
);

it.effect("preserves the public read's NotFound error", () =>
  Effect.gen(function* () {
    const error = yield* fetchPublicVenue(options, venue.id).pipe(
      Effect.provideService(FetchHttpClient.Fetch, async () =>
        Response.json(
          Schema.encodeSync(Schema.toCodecJson(NotFound))(new NotFound({ resource: "venue" })),
          { status: 404 },
        ),
      ),
      Effect.flip,
    );

    expect(Schema.is(NotFound)(error)).toBe(true);

    if (Schema.is(NotFound)(error)) expect(error.resource).toBe("venue");
  }),
);

const notFound = () =>
  Response.json(
    Schema.encodeSync(Schema.toCodecJson(NotFound))(new NotFound({ resource: "table" })),
    { status: 404 },
  );

const capture = (respond: (request: Request) => Response) => {
  const seen: Array<Request> = [];

  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    seen.push(request);

    return respond(request);
  };

  return { seen, fetch };
};

it.effect("names its install in X-Origin on a push, signed in or as a device", () =>
  Effect.gen(function* () {
    const { seen, fetch } = capture(() => Response.json({ results: [] }));
    const actorId = ActorId.make(crypto.randomUUID());

    const payload = {
      identity: { playerId: PlayerId.make(crypto.randomUUID()), actorId },
      commands: [
        RecordingCommand.make({
          type: "delete_table",
          operationId: RecordingOperationId.make(crypto.randomUUID()),
          actorId,
          preparedAt: DateTime.makeUnsafe(0),
          tableId: TableId.make(crypto.randomUUID()),
        }),
      ],
    };

    const transport = makeRecordingTransport({
      baseUrl: options.baseUrl,
      getToken: async () => "session",
      origin: "install-1",
    });

    for (const actor of [null, { actorId, secret: "secret-1" }]) {
      yield* transport
        .push(payload, actor)
        .pipe(Effect.provideService(FetchHttpClient.Fetch, fetch));
    }

    expect(seen.map((request) => request.headers.get("x-origin"))).toEqual([
      "install-1",
      "install-1",
    ]);
    expect(seen.map((request) => request.headers.get("authorization"))).toEqual([
      "Bearer session",
      `Actor ${actorId}.secret-1`,
    ]);
  }),
);

it.effect("checks the view a scope names with the credential its socket uses", () =>
  Effect.gen(function* () {
    const { seen, fetch } = capture(() => notFound());

    const watchable = makeScopeWatchable({
      baseUrl: options.baseUrl,
      authorization: async () => "Actor a.b",
    });

    const table = TableId.make(crypto.randomUUID());
    const group = GroupId.make(crypto.randomUUID());

    expect(
      yield* watchable(tableScope(table)).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    ).toBe(false);
    yield* watchable(groupScope(group)).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch));

    expect(seen.map((request) => new URL(request.url).pathname)).toEqual([
      `/api/tables/${table}`,
      `/api/groups/${group}`,
    ]);
    expect(seen.every((request) => request.headers.get("authorization") === "Actor a.b")).toBe(
      true,
    );
  }),
);

it.effect("keeps watching on a server error, and stops on a refused share link", () =>
  Effect.gen(function* () {
    const broken = capture(() => new Response("boom", { status: 500 }));
    const gone = capture(() => notFound());
    const watchable = makeSharedWatchable({ baseUrl: options.baseUrl }, "link");

    expect(
      yield* watchable().pipe(Effect.provideService(FetchHttpClient.Fetch, broken.fetch)),
    ).toBe(true);
    expect(yield* watchable().pipe(Effect.provideService(FetchHttpClient.Fetch, gone.fetch))).toBe(
      false,
    );
  }),
);
