import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { Venue, VenueId } from "@stacks/contracts";

import { fetchPublicVenue, searchPublicVenues } from "./api.ts";

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
        Response.json({ _tag: "NotFound", resource: "venue" }, { status: 404 }),
      ),
      Effect.flip,
    );
    expect(error).toMatchObject({ _tag: "NotFound", resource: "venue" });
  }),
);
