import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import type { TripId } from "@stacks/contracts";

import { catalogVenue, groupWith, ids, usd, users, type TestGroup } from "../testing/fixtures.ts";
import { TestApi } from "../testing/TestApi.ts";

type Client = Effect.Success<ReturnType<TestApi["Service"]["as"]>>;

const day = (n: number) => DateTime.makeUnsafe(Date.UTC(2026, 9, 20 + n, 20));

const startSession = Effect.fn("test.startSession")(function* (
  client: Client,
  group: TestGroup,
  tripId: TripId,
) {
  const venue = yield* catalogVenue(client);
  const id = ids.session();
  yield* client.sessions.create({
    params: { tripId },
    payload: {
      id,
      venueId: venue.id,
      game: "blackjack",
      playerIds: [group.myPlayerId],
      notes: null,
      startedAt: day(1),
    },
  });
  return id;
});

it.layer(TestApi.layer, { timeout: "30 seconds" })("trips", (it) => {
  it.effect("hold their own sessions and their own ledger", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const beaId = group.players.find((p) => p.id !== group.myPlayerId)!.id;
      const reno = yield* alex.trips.create({
        params: { groupId: group.group.id },
        payload: { id: ids.trip(), name: "Reno" },
      });
      const inVegas = yield* startSession(alex, group, group.tripId);
      const inReno = yield* startSession(alex, group, reno.id);
      yield* alex.ledger.addEntry({
        params: { sessionId: inReno },
        payload: {
          id: ids.entry(),
          kind: "buy_in",
          playerId: group.myPlayerId,
          counterpartyId: beaId,
          amount: usd(500),
          note: null,
          replacesEntryId: null,
        },
      });

      const vegas = yield* bea.trips.get({ params: { tripId: group.tripId } });
      expect(vegas.sessions.map((s) => s.session.id)).toEqual([inVegas]);
      expect(vegas.balances).toEqual([]);
      const renoDetail = yield* bea.trips.get({ params: { tripId: reno.id } });
      expect(renoDetail.sessions.map((s) => [s.session.id, s.session.tripId])).toEqual([
        [inReno, reno.id],
      ]);
      expect(renoDetail.balances).toEqual(
        expect.arrayContaining([
          { playerId: beaId, amount: 500 },
          { playerId: group.myPlayerId, amount: -500 },
        ]),
      );
    }),
  );

  it.effect("say which trip is going and which table you're seated at", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const [before] = yield* alex.groups.list();
      expect(before).toMatchObject({ currentTripId: group.tripId, mySession: null });
      expect(before?.trips.map((t) => t.id)).toEqual([group.tripId]);

      const sessionId = yield* startSession(alex, group, group.tripId);
      const [seated] = yield* alex.groups.list();
      expect(seated?.mySession).toMatchObject({ id: sessionId, tripId: group.tripId });
      expect(seated?.mySession?.venueName).toBeTruthy();
      // Bea is in the group but not at the table.
      const [watching] = yield* bea.groups.list();
      expect(watching?.mySession).toBeNull();
      const trip = yield* alex.trips.get({ params: { tripId: group.tripId } });
      expect(trip.sessions.map((s) => s.playerIds)).toEqual([[group.myPlayerId]]);

      const beaId = group.players.find((p) => p.id !== group.myPlayerId)!.id;
      yield* alex.ledger.addEntry({
        params: { sessionId },
        payload: {
          id: ids.entry(),
          kind: "buy_in",
          playerId: group.myPlayerId,
          counterpartyId: beaId,
          amount: usd(8000),
          note: null,
          replacesEntryId: null,
        },
      });
      yield* alex.sessions.close({
        params: { sessionId },
        payload: {
          endedAt: day(2),
          cashOuts: [{ id: ids.entry(), playerId: group.myPlayerId, amount: usd(0) }],
        },
      });
      yield* alex.trips.end({ params: { tripId: group.tripId }, payload: { endedAt: day(3) } });
      const [after] = yield* alex.groups.list();
      expect(after).toMatchObject({ currentTripId: null, mySession: null });
    }),
  );

  it.effect("take no new sessions once ended, until reopened", () =>
    Effect.gen(function* () {
      const { alex } = yield* users("alex");
      const group = yield* groupWith(alex);
      const played = yield* startSession(alex, group, group.tripId);
      yield* alex.trips.end({ params: { tripId: group.tripId }, payload: {} });
      // A retry of a session that already landed still gets it back.
      const venue = yield* catalogVenue(alex);
      const retried = yield* alex.sessions.create({
        params: { tripId: group.tripId },
        payload: {
          id: played,
          venueId: venue.id,
          game: "blackjack",
          playerIds: [group.myPlayerId],
          notes: null,
        },
      });
      expect(retried.session.id).toBe(played);
      expect(yield* Effect.flip(startSession(alex, group, group.tripId))).toMatchObject({
        _tag: "Conflict",
        reason: "trip_ended",
      });
      expect(
        yield* Effect.flip(alex.trips.end({ params: { tripId: group.tripId }, payload: {} })),
      ).toMatchObject({ _tag: "Conflict", reason: "trip_ended" });
      yield* alex.trips.reopen({ params: { tripId: group.tripId } });
      expect(
        yield* Effect.flip(alex.trips.reopen({ params: { tripId: group.tripId } })),
      ).toMatchObject({ _tag: "Conflict", reason: "trip_open" });
      yield* startSession(alex, group, group.tripId);
    }),
  );

  it.effect("let an admin move a session to another trip in the group", () =>
    Effect.gen(function* () {
      const { alex, bea, eve } = yield* users("alex", "bea", "eve");
      const group = yield* groupWith(alex, bea);
      const elsewhere = yield* groupWith(eve);
      const reno = yield* alex.trips.create({
        params: { groupId: group.group.id },
        payload: { id: ids.trip(), name: "Reno" },
      });
      const session = yield* startSession(alex, group, group.tripId);

      expect(
        yield* Effect.flip(
          bea.sessions.move({ params: { sessionId: session }, payload: { tripId: reno.id } }),
        ),
      ).toMatchObject({ _tag: "Forbidden", reason: "admins_only" });
      expect(
        yield* Effect.flip(
          alex.sessions.move({
            params: { sessionId: session },
            payload: { tripId: elsewhere.tripId },
          }),
        ),
      ).toMatchObject({ _tag: "NotFound", resource: "trip" });
      const moved = yield* alex.sessions.move({
        params: { sessionId: session },
        payload: { tripId: reno.id },
      });
      expect(moved.session.tripId).toBe(reno.id);
    }),
  );

  it.effect("can be deleted only while empty, by whoever started it or an admin", () =>
    Effect.gen(function* () {
      const { alex, bea, eve } = yield* users("alex", "bea", "eve");
      const group = yield* groupWith(alex, bea);
      const spare = yield* alex.trips.create({
        params: { groupId: group.group.id },
        payload: { id: ids.trip(), name: "Maybe Reno" },
      });
      yield* startSession(alex, group, group.tripId);

      expect(yield* Effect.flip(eve.trips.get({ params: { tripId: spare.id } }))).toMatchObject({
        _tag: "Forbidden",
        reason: "not_a_member",
      });
      expect(yield* Effect.flip(bea.trips.delete({ params: { tripId: spare.id } }))).toMatchObject({
        _tag: "Forbidden",
        reason: "not_your_trip",
      });
      expect(
        yield* Effect.flip(alex.trips.delete({ params: { tripId: group.tripId } })),
      ).toMatchObject({ _tag: "Conflict", reason: "trip_not_empty" });

      yield* alex.trips.delete({ params: { tripId: spare.id } });
      const detail = yield* alex.groups.get({ params: { groupId: group.group.id } });
      expect(detail.trips.map((t) => t.id)).toEqual([group.tripId]);
    }),
  );
});
