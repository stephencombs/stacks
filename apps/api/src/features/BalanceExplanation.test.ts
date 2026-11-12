import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";

import { catalogVenue, groupWith, ids, usd, users } from "../testing/fixtures.ts";
import { TestApi } from "../testing/TestApi.ts";

it.layer(TestApi.layer, { timeout: "30 seconds" })("balance explanation", (it) => {
  it.effect("explains a guest's covered money and partial payments without table results", () =>
    Effect.gen(function* () {
      const { alex } = yield* users("alex");
      const group = yield* groupWith(alex);
      const guestId = ids.player();
      yield* alex.guests.add({
        params: { groupId: group.group.id },
        payload: { id: guestId, displayName: "Guest" },
      });
      const venue = yield* catalogVenue(alex);
      const sessionId = ids.session();
      yield* alex.sessions.create({
        params: { tripId: group.tripId },
        payload: {
          id: sessionId,
          venueId: venue.id,
          game: "blackjack",
          playerIds: [guestId],
          notes: null,
        },
      });
      const buyInId = ids.entry();
      yield* alex.ledger.addEntry({
        params: { sessionId },
        payload: {
          id: buyInId,
          kind: "buy_in",
          playerId: guestId,
          counterpartyId: group.myPlayerId,
          amount: usd(10001),
          note: null,
          replacesEntryId: null,
        },
      });
      yield* alex.ledger.addEntry({
        params: { sessionId },
        payload: {
          id: ids.entry(),
          kind: "adjustment",
          playerId: guestId,
          counterpartyId: null,
          amount: usd(50000),
          note: null,
          replacesEntryId: null,
        },
      });
      yield* alex.ledger.recordSettlement({
        params: { tripId: group.tripId },
        payload: {
          id: ids.entry(),
          fromPlayerId: guestId,
          toPlayerId: group.myPlayerId,
          amount: usd(2501),
          note: null,
        },
      });
      const explanation = yield* alex.trips.balance({
        params: { tripId: group.tripId, playerId: guestId },
      });
      expect(explanation.total).toBe(-7500);
      expect(explanation.lines.map((line) => [line.kind, line.amount])).toEqual([
        ["covered_buy_in", -10001],
        ["settlement", 2501],
      ]);
      expect(explanation.lines[0]).toMatchObject({ entryId: buyInId, sessionId });
      const trip = yield* alex.trips.get({ params: { tripId: group.tripId } });
      expect(trip.balances.find((item) => item.playerId === guestId)?.amount).toBe(
        explanation.total,
      );
      yield* alex.ledger.recordSettlement({
        params: { tripId: group.tripId },
        payload: {
          id: ids.entry(),
          fromPlayerId: guestId,
          toPlayerId: group.myPlayerId,
          amount: usd(7500),
          note: null,
        },
      });
      const settled = yield* alex.trips.balance({
        params: { tripId: group.tripId, playerId: guestId },
      });
      expect(settled.total).toBe(0);
      expect(settled.lines).toHaveLength(3);
      yield* alex.ledger.voidEntry({
        params: { entryId: buyInId },
        payload: { reason: "Wrong counterparty" },
      });
      const corrected = yield* alex.trips.balance({
        params: { tripId: group.tripId, playerId: guestId },
      });
      expect(corrected.total).toBe(10001);
      expect(
        corrected.lines.some((line) => line.kind !== "stake" && line.entryId === buyInId),
      ).toBe(false);
    }),
  );

  it.effect("uses the actual stake outcome, keeping principal and result separate", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const borrower = group.players.find((item) => item.id !== group.myPlayerId)!.id;
      const startedAt = DateTime.makeUnsafe("2026-10-22T20:00:00Z");
      const stake = yield* alex.stakes.create({
        params: { tripId: group.tripId },
        payload: {
          id: ids.stake(),
          lenderId: group.myPlayerId,
          borrowerId: borrower,
          amount: usd(10001),
          lenderShare: 30,
          startedAt,
          note: null,
        },
      });
      const venue = yield* catalogVenue(alex);
      const sessionId = ids.session();
      yield* alex.sessions.create({
        params: { tripId: group.tripId },
        payload: {
          id: sessionId,
          venueId: venue.id,
          game: "blackjack",
          playerIds: [borrower],
          notes: null,
          startedAt,
        },
      });
      yield* alex.ledger.addEntry({
        params: { sessionId },
        payload: {
          id: ids.entry(),
          kind: "adjustment",
          playerId: borrower,
          counterpartyId: null,
          amount: usd(101),
          note: null,
          replacesEntryId: null,
        },
      });
      const explanation = yield* bea.trips.balance({
        params: { tripId: group.tripId, playerId: borrower },
      });
      expect(explanation.total).toBe(-10031);
      expect(explanation.lines).toEqual([
        expect.objectContaining({
          kind: "stake",
          stakeId: stake.id,
          amount: -10031,
          principal: 10001,
          result: 101,
          lenderShare: 30,
        }),
      ]);
      const trip = yield* alex.trips.get({ params: { tripId: group.tripId } });
      expect(trip.balances.find((item) => item.playerId === borrower)?.amount).toBe(
        explanation.total,
      );
    }),
  );

  it.effect("requires group membership and refuses a player from another group", () =>
    Effect.gen(function* () {
      const { alex, outsider } = yield* users("alex", "outsider");
      const group = yield* groupWith(alex);
      expect(
        yield* Effect.flip(
          outsider.trips.balance({ params: { tripId: group.tripId, playerId: group.myPlayerId } }),
        ),
      ).toMatchObject({ _tag: "Forbidden", reason: "not_a_member" });
      expect(
        yield* Effect.flip(
          alex.trips.balance({ params: { tripId: group.tripId, playerId: ids.player() } }),
        ),
      ).toMatchObject({ _tag: "NotFound", resource: "player" });
    }),
  );
});
