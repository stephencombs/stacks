import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { TripId, type GroupDetail } from "@stacks/contracts";

import { catalogVenue, groupWith, ids, users } from "../testing/fixtures.ts";
import { TestApi } from "../testing/TestApi.ts";

type Client = Effect.Success<ReturnType<TestApi["Service"]["as"]>>;

const day = (n: number, hour = 20) => DateTime.makeUnsafe(Date.UTC(2026, 9, 20 + n, hour));
const tripId = () => TripId.make(crypto.randomUUID());

const startSession = Effect.fn("test.startSession")(function* (
  client: Client,
  group: GroupDetail,
  on: DateTime.Utc,
) {
  const venue = yield* catalogVenue(client);
  const id = ids.session();
  yield* client.sessions.create({
    params: { groupId: group.group.id },
    payload: {
      id,
      venueId: venue.id,
      game: "blackjack",
      playerIds: [group.myPlayerId],
      notes: null,
      startedAt: on,
    },
  });
  return id;
});

it.layer(TestApi.layer, { timeout: "30 seconds" })("trips", (it) => {
  it.effect("holds the sessions that start while it's open", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const before = yield* startSession(alex, group, day(0));
      const first = yield* startSession(alex, group, day(1));
      const second = yield* startSession(alex, group, day(2, 3));
      const after = yield* startSession(alex, group, day(4));

      const trip = yield* alex.trips.create({
        params: { groupId: group.group.id },
        payload: { id: tripId(), name: "Vegas 2026", startedAt: day(1, 12) },
      });
      expect(trip).toMatchObject({ name: "Vegas 2026", endedAt: null });
      yield* bea.trips.end({ params: { tripId: trip.id }, payload: { endedAt: day(3) } });

      const detail = yield* bea.trips.get({ params: { tripId: trip.id } });
      expect(detail.sessions.map((s) => s.session.id)).toEqual([first, second]);
      expect(detail.sessions.map((s) => s.session.id)).not.toContain(before);
      expect(detail.sessions.map((s) => s.session.id)).not.toContain(after);

      const listed = yield* alex.groups.get({ params: { groupId: group.group.id } });
      expect(listed.trips).toEqual([expect.objectContaining({ id: trip.id })]);
    }),
  );

  it.effect("keeps a group's trips from overlapping, ends and reopens them", () =>
    Effect.gen(function* () {
      const { alex } = yield* users("alex");
      const group = yield* groupWith(alex);
      const groupId = group.group.id;
      const create = (startedAt: DateTime.Utc) =>
        alex.trips.create({
          params: { groupId },
          payload: { id: tripId(), name: "Trip", startedAt },
        });

      const first = yield* create(day(1));
      expect(yield* Effect.flip(create(day(2)))).toMatchObject({
        _tag: "Conflict",
        reason: "trip_overlaps",
      });
      yield* alex.trips.end({ params: { tripId: first.id }, payload: { endedAt: day(3) } });
      expect(
        yield* Effect.flip(alex.trips.end({ params: { tripId: first.id }, payload: {} })),
      ).toMatchObject({ _tag: "Conflict", reason: "trip_ended" });
      expect(
        yield* Effect.flip(
          alex.trips.end({
            params: { tripId: (yield* create(day(5))).id },
            payload: { endedAt: day(4) },
          }),
        ),
      ).toMatchObject({ _tag: "InvalidRequest" });

      // A later trip exists, so the first can't run open-ended again.
      expect(yield* Effect.flip(alex.trips.reopen({ params: { tripId: first.id } }))).toMatchObject(
        { _tag: "Conflict", reason: "trip_overlaps" },
      );
    }),
  );

  it.effect("lets whoever started it or an admin delete it, and keeps its sessions", () =>
    Effect.gen(function* () {
      const { alex, bea, eve } = yield* users("alex", "bea", "eve");
      const group = yield* groupWith(alex, bea);
      const session = yield* startSession(alex, group, day(1));
      const trip = yield* alex.trips.create({
        params: { groupId: group.group.id },
        payload: { id: tripId(), name: "Weekend", startedAt: day(0) },
      });

      expect(yield* Effect.flip(eve.trips.get({ params: { tripId: trip.id } }))).toMatchObject({
        _tag: "Forbidden",
        reason: "not_a_member",
      });
      const beas = yield* bea.trips.create({
        params: { groupId: group.group.id },
        payload: { id: trip.id, name: "Same id", startedAt: day(0) },
      });
      expect(beas.name).toBe("Weekend");
      expect(yield* Effect.flip(bea.trips.delete({ params: { tripId: trip.id } }))).toMatchObject({
        _tag: "Forbidden",
        reason: "not_your_trip",
      });

      yield* alex.trips.delete({ params: { tripId: trip.id } });
      expect(yield* Effect.flip(alex.trips.get({ params: { tripId: trip.id } }))).toMatchObject({
        _tag: "NotFound",
        resource: "trip",
      });
      const detail = yield* alex.groups.get({ params: { groupId: group.group.id } });
      expect(detail.sessions.map((s) => s.session.id)).toContain(session);
      expect(detail.trips).toEqual([]);
    }),
  );
});
