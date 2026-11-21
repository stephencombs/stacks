import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { catalogVenue, groupWith, ids, users } from "../testing/fixtures.ts";
import { TestApi } from "../testing/TestApi.ts";
import { seedSession } from "../testing/legacySessions.ts";

it.layer(TestApi.layer, { timeout: "30 seconds" })("venues", (it) => {
  it.effect("searches and reads only public venues without signing in", () =>
    Effect.gen(function* () {
      const { owner } = yield* users("owner");
      const group = yield* groupWith(owner);
      const venue = yield* catalogVenue(owner);
      const home = yield* owner.venues.create({
        payload: {
          id: ids.venue(),
          name: venue.name,
          kind: "home",
          city: null,
          region: null,
          country: null,
          groupId: group.group.id,
        },
      });
      const anonymous = yield* (yield* TestApi).asActor(null);
      const found = yield* anonymous.publicVenues.search({ query: { q: venue.name } });
      expect(found).toEqual([venue]);
      const withGroup = { q: venue.name, groupId: group.group.id };
      expect(
        yield* anonymous.publicVenues.search({
          query: withGroup,
        }),
      ).toEqual([venue]);
      expect(yield* anonymous.publicVenues.get({ params: { venueId: venue.id } })).toEqual(venue);
      for (const venueId of [home.id, ids.venue()]) {
        expect(
          yield* anonymous.publicVenues.get({ params: { venueId } }).pipe(Effect.flip),
        ).toMatchObject({ _tag: "NotFound", resource: "venue" });
      }
      expect(
        yield* owner.publicVenues.get({ params: { venueId: home.id } }).pipe(Effect.flip),
      ).toMatchObject({ _tag: "NotFound", resource: "venue" });
      expect(
        yield* anonymous.venues.search({ query: { q: venue.name } }).pipe(Effect.flip),
      ).toMatchObject({ _tag: "Unauthorized" });
    }),
  );

  it.effect("finds nearby public venues without exposing a home venue", () =>
    Effect.gen(function* () {
      const { owner } = yield* users("owner");
      const group = yield* groupWith(owner);
      const venue = yield* catalogVenue(owner);
      const home = yield* owner.venues.create({
        payload: {
          id: ids.venue(),
          name: `Home ${crypto.randomUUID()}`,
          kind: "home",
          city: null,
          region: null,
          country: null,
          groupId: group.group.id,
        },
      });
      const near = { lat: 40 + Math.random(), lng: -115 + Math.random() };
      const sql = yield* SqlClient.SqlClient;
      yield* sql`
        update venues set lat = ${near.lat}, lng = ${near.lng}
        where id in ${sql.in([venue.id, home.id])}
      `;
      const anonymous = yield* (yield* TestApi).asActor(null);
      const found = yield* anonymous.publicVenues.search({ query: near });
      expect(found[0]?.id).toBe(venue.id);
      expect(found.length).toBeLessThanOrEqual(20);
      expect(found.every((item) => item.groupId === null)).toBe(true);
      expect(found.map((item) => item.id)).not.toContain(home.id);
      expect(yield* anonymous.publicVenues.get({ params: { venueId: venue.id } })).toEqual({
        ...venue,
        ...near,
      });
    }),
  );

  it.effect("shares casinos with everyone, unverified until reviewed", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const venue = yield* catalogVenue(alex);
      expect(venue).toMatchObject({ kind: "casino", verified: false, groupId: null });
      const found = yield* bea.venues.search({ query: { q: venue.name.slice(-6) } });
      expect(found.map((v) => v.id)).toContain(venue.id);
    }),
  );

  it.effect("keeps a home game private to its group", () =>
    Effect.gen(function* () {
      const { alex, eve } = yield* users("alex", "eve");
      const group = yield* groupWith(alex);
      const other = yield* groupWith(eve);
      const name = `Garage ${crypto.randomUUID().slice(0, 6)}`;
      const home = yield* alex.venues.create({
        payload: {
          id: ids.venue(),
          name,
          kind: "home",
          city: null,
          region: null,
          country: null,
          groupId: group.group.id,
        },
      });

      const mine = yield* alex.venues.search({ query: { q: name, groupId: group.group.id } });
      expect(mine.map((v) => v.id)).toEqual([home.id]);
      expect(yield* eve.venues.search({ query: { q: name, groupId: other.group.id } })).toEqual([]);
      expect(
        yield* Effect.flip(eve.venues.search({ query: { q: name, groupId: group.group.id } })),
      ).toMatchObject({ _tag: "Forbidden" });
    }),
  );

  it.effect("needs a group for a home venue", () =>
    Effect.gen(function* () {
      const { alex } = yield* users("alex");
      const error = yield* Effect.flip(
        alex.venues.create({
          payload: {
            id: ids.venue(),
            name: "Somewhere",
            kind: "home",
            city: null,
            region: null,
            country: null,
            groupId: null,
          },
        }),
      );
      expect(error).toMatchObject({ _tag: "InvalidRequest" });
    }),
  );

  it.effect("lists a group's venues by when they last played there", () =>
    Effect.gen(function* () {
      const { alex } = yield* users("alex");
      const group = yield* groupWith(alex);
      const [first, second] = [yield* catalogVenue(alex), yield* catalogVenue(alex)];
      for (const [venue, startedAt] of [
        [first, "2026-01-01T20:00:00Z"],
        [second, "2026-02-01T20:00:00Z"],
      ] as const) {
        yield* seedSession(group.tripId, {
          id: ids.session(),
          venueId: venue.id,
          game: "roulette",
          startedAt: DateTime.makeUnsafe(startedAt),
          playerIds: [group.myPlayerId],
          notes: null,
        });
      }
      const recent = yield* alex.venues.recent({ params: { groupId: group.group.id } });
      expect(recent.map((v) => v.id)).toEqual([second.id, first.id]);
    }),
  );
});
