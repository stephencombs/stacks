import type { AddEntryRequest } from "@stacks/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { catalogVenue, groupWith, ids, usd, users } from "../testing/fixtures.ts";
import { TestApi } from "../testing/TestApi.ts";
import {
  finishHistoricalSession,
  seedEntry,
  seedSession,
  voidHistoricalEntry,
} from "../testing/legacySessions.ts";

it.layer(TestApi.layer, { timeout: "30 seconds" })("historical ledger", (it) => {
  it.effect("tracks results and debts", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const [alexId, beaId] = [group.myPlayerId, group.players[1]!.id];
      const venue = yield* catalogVenue(alex);
      const sessionId = ids.session();
      yield* seedSession(group.tripId, {
        id: sessionId,
        venueId: venue.id,
        game: "blackjack",
        playerIds: [alexId, beaId],
        notes: null,
      });

      const add = (
        kind: "buy_in" | "cash_out",
        playerId: typeof alexId,
        amount: number,
        counterpartyId: typeof alexId | null = null,
      ) =>
        seedEntry(sessionId, {
          id: ids.entry(),
          kind,
          playerId,
          counterpartyId,
          amount: usd(amount),
          note: null,
          replacesEntryId: null,
        });
      // Bea covers Alex's second buy-in, and Alex holds Bea's cash at the end.
      yield* add("buy_in", alexId, 10000);
      yield* add("buy_in", alexId, 5000, beaId);
      yield* add("buy_in", beaId, 20000);
      yield* add("cash_out", alexId, 32000);

      // The trip shows who's still at the table, so their chips can count as in play.
      const midway = yield* bea.trips.get({ params: { tripId: group.tripId } });
      expect(midway.sessions[0]?.playing).toEqual([beaId]);

      yield* add("cash_out", beaId, 12000, alexId);
      yield* finishHistoricalSession(sessionId);
      const closed = yield* alex.sessions.get({ params: { sessionId } });
      expect(closed.session.status).toBe("closed");
      const after = yield* bea.trips.get({ params: { tripId: group.tripId } });
      expect(after.sessions[0]?.playing).toEqual([]);
      expect(closed.results).toEqual(
        expect.arrayContaining([
          { playerId: alexId, buyIn: 15000, cashOut: 32000, adjustment: 0, net: 17000 },
          { playerId: beaId, buyIn: 20000, cashOut: 12000, adjustment: 0, net: -8000 },
        ]),
      );

      // Alex owes Bea 5,000 for the buy-in and 12,000 for the cash Alex kept.
      const detail = yield* bea.trips.get({ params: { tripId: group.tripId } });
      expect(detail.balances).toEqual(
        expect.arrayContaining([
          { playerId: alexId, amount: -17000 },
          { playerId: beaId, amount: 17000 },
        ]),
      );
    }),
  );
});

it.layer(TestApi.layer, { timeout: "30 seconds" })("retired ledger", (it) => {
  it.effect("keeps existing voids and corrections readable and rejects every entry write", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const venue = yield* catalogVenue(alex);
      const playerId = group.myPlayerId;
      const sessionId = yield* seedSession(group.tripId, {
        id: ids.session(),
        venueId: venue.id,
        game: "blackjack",
        playerIds: [playerId],
        notes: null,
      });
      const params = { sessionId };
      const purchase = {
        id: ids.entry(),
        kind: "buy_in" as const,
        playerId,
        amount: usd(1000),
        counterpartyId: null,
        note: null,
        replacesEntryId: null,
      };
      const mistake = yield* seedEntry(sessionId, purchase);
      const corrected = yield* seedEntry(sessionId, {
        ...purchase,
        id: ids.entry(),
        amount: usd(2000),
        replacesEntryId: mistake.id,
      });
      const dropped = yield* seedEntry(sessionId, {
        ...purchase,
        id: ids.entry(),
        kind: "adjustment",
      });
      yield* voidHistoricalEntry(dropped.id, "Wrong table");

      const read = bea.sessions.get({ params });
      const before = yield* read;
      expect(before.results).toMatchObject([{ playerId, buyIn: 2000, net: -2000 }]);
      expect(before.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: mistake.id, voidReason: "Corrected" }),
          expect.objectContaining({ id: corrected.id, replacesEntryId: mistake.id }),
          expect.objectContaining({ id: dropped.id, voidReason: "Wrong table" }),
        ]),
      );
      const add = (payload: typeof AddEntryRequest.Type) =>
        alex.ledger.addEntry({ params, payload });
      for (const request of [
        add({ ...purchase, id: ids.entry() }),
        add(corrected),
        add({ ...purchase, id: ids.entry(), kind: "cash_out" }),
        add({ ...purchase, id: ids.entry(), kind: "adjustment" }),
        add({ ...purchase, id: ids.entry(), replacesEntryId: corrected.id }),
        bea.ledger.voidEntry({ params: { entryId: corrected.id }, payload: { reason: null } }),
      ]) {
        expect(yield* Effect.flip(request)).toMatchObject({
          _tag: "Conflict",
          reason: "legacy_sessions_retired",
        });
      }
      expect(yield* read).toEqual(before);
    }),
  );
});
