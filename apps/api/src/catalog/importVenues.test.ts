import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { users } from "../testing/fixtures.ts";
import { TestApi } from "../testing/TestApi.ts";
import { importVenues } from "./importVenues.ts";
import { OverpassResponse, fromOsm } from "./osm.ts";

const overpass = (suffix: string, name: string) => ({
  elements: [
    {
      type: "node",
      id: 1,
      lat: 36.1126,
      lon: -115.1767,
      tags: {
        amenity: "casino",
        name,
        "addr:city": "Las Vegas",
        "addr:state": "NV",
        "addr:country": "us",
      },
    },
    {
      type: "way",
      id: 2,
      center: { lat: 43.7384, lon: 7.4246 },
      tags: {
        amenity: "casino",
        name: "Casino de Monte-Carlo",
        "name:en": "Monte Carlo Casino",
        "addr:country": "Monaco",
      },
    },
    { type: "node", id: 3, lat: 0, lon: 0, tags: { amenity: "casino" } },
  ].map((element) => ({ ...element, id: Number(`${suffix}${element.id}`) })),
});

const parse = (json: unknown) =>
  Schema.decodeUnknownSync(OverpassResponse)(json)
    .elements.map(fromOsm)
    .filter((venue) => venue !== null);

it("maps OSM casinos and skips unnamed ones", () => {
  expect(parse(overpass("9", "Bellagio"))).toEqual([
    {
      name: "Bellagio",
      kind: "casino",
      city: "Las Vegas",
      region: "NV",
      country: "US",
      lat: 36.1126,
      lng: -115.1767,
      source: "osm",
      sourceRef: "node/91",
    },
    expect.objectContaining({
      name: "Monte Carlo Casino",
      country: null,
      lat: 43.7384,
      sourceRef: "way/92",
    }),
  ]);
});

it.layer(TestApi.layer, { timeout: "30 seconds" })("importVenues", (it) => {
  it.effect("adds new venues, updates known ones and keeps them searchable", () =>
    Effect.gen(function* () {
      const suffix = String(Date.now() % 1_000_000_000);
      const first = yield* importVenues(parse(overpass(suffix, `Bellagio ${suffix}`)));
      expect(first).toEqual({ inserted: 2, updated: 0 });

      const second = yield* importVenues(parse(overpass(suffix, `Bellagio Resort ${suffix}`)));
      expect(second).toEqual({ inserted: 0, updated: 2 });

      const { alex } = yield* users("alex");
      const found = yield* alex.venues.search({ query: { q: `Bellagio Resort ${suffix}` } });
      expect(found).toEqual([expect.objectContaining({ verified: true, city: "Las Vegas" })]);
    }),
  );
});
