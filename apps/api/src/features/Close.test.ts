import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { CurrencyCode } from "@stacks/contracts";

import { catalogVenue, ids, usd, users } from "../testing/fixtures.ts";
import { finishHistoricalSession, seedEntry, seedSession } from "../testing/legacySessions.ts";
import { TestApi } from "../testing/TestApi.ts";

it.layer(TestApi.layer, { timeout: "30 seconds" })("retired sessions", (it) => {
  it.effect("refuses every session write without changing historical data", () =>
    Effect.gen(function* () {
      const { alex } = yield* users("alex");
      for (const currency of ["USD", "JPY"]) {
        const groupId = ids.group();
        const group = yield* alex.groups.create({
          payload: {
            id: groupId,
            name: "Crew",
            currency: CurrencyCode.make(currency),
            displayName: "Alex",
          },
        });
        const trip = yield* alex.trips.create({
          params: { groupId },
          payload: { id: ids.trip(), name: "Vegas" },
        });
        const otherTrip = yield* alex.trips.create({
          params: { groupId },
          payload: { id: ids.trip(), name: "Reno" },
        });
        const venue = yield* catalogVenue(alex);
        const playerId = group.myPlayerId;
        const payload = {
          id: ids.session(),
          venueId: venue.id,
          game: "blackjack" as const,
          playerIds: [playerId] as const,
          notes: null,
        };
        const sessionId = yield* seedSession(trip.id, payload);
        const params = { sessionId };
        const buyIn = yield* seedEntry(sessionId, {
          id: ids.entry(),
          kind: "buy_in",
          playerId,
          counterpartyId: null,
          amount: usd(10000),
          note: null,
          replacesEntryId: null,
        });
        const read = alex.sessions.get({ params });
        const before = yield* read;
        const create = (id: typeof sessionId) =>
          alex.sessions.create({ params: { tripId: trip.id }, payload: { ...payload, id } });
        const fresh = ids.session();
        for (const request of [
          create(fresh),
          create(sessionId),
          alex.sessions.addPlayer({ params, payload: { playerId } }),
          alex.sessions.seat({ params, payload: { id: ids.seating(), playerId, seat: 1 } }),
          alex.sessions.setTable({ params, payload: { seats: 7 } }),
          alex.sessions.setHighLimit({ params, payload: { highLimit: true } }),
          alex.sessions.move({ params, payload: { tripId: otherTrip.id } }),
          alex.sessions.close({
            params,
            payload: { cashOuts: [{ id: ids.entry(), playerId, amount: usd(20000) }] },
          }),
        ]) {
          expect(yield* Effect.flip(request)).toMatchObject({
            _tag: "Conflict",
            reason: "legacy_sessions_retired",
          });
        }
        expect(
          yield* Effect.flip(alex.sessions.get({ params: { sessionId: fresh } })),
        ).toMatchObject({
          _tag: "NotFound",
        });
        expect(yield* read).toEqual(before);
        expect(before.entries.map((entry) => entry.id)).toEqual([buyIn.id]);

        yield* finishHistoricalSession(sessionId);
        const closed = yield* read;
        expect(closed.session.status).toBe("closed");
        expect(yield* Effect.flip(alex.sessions.reopen({ params }))).toMatchObject({
          _tag: "Conflict",
          reason: "legacy_sessions_retired",
        });
        expect(yield* read).toEqual(closed);
      }
    }),
  );
});
