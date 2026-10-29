import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { catalogVenue, groupWith, ids, users } from "../testing/fixtures.ts";
import { TestApi } from "../testing/TestApi.ts";

it.layer(TestApi.layer, { timeout: "30 seconds" })("venues", (it) => {
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
        yield* Effect.flip(
          eve.sessions.create({
            params: { tripId: other.tripId },
            payload: {
              id: ids.session(),
              venueId: home.id,
              game: "poker_cash",
              playerIds: [other.myPlayerId],
              notes: null,
            },
          }),
        ),
      ).toMatchObject({ reason: "venue_not_available" });
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
        yield* alex.sessions.create({
          params: { tripId: group.tripId },
          payload: {
            id: ids.session(),
            venueId: venue.id,
            game: "roulette",
            startedAt: DateTime.makeUnsafe(startedAt),
            playerIds: [group.myPlayerId],
            notes: null,
          },
        });
      }
      const recent = yield* alex.venues.recent({ params: { groupId: group.group.id } });
      expect(recent.map((v) => v.id)).toEqual([second.id, first.id]);
    }),
  );
});
