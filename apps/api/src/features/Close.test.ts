import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { PlayerId } from "@stacks/contracts";

import { catalogVenue, groupWith, ids, usd, users } from "../testing/fixtures.ts";
import { TestApi } from "../testing/TestApi.ts";

it.layer(TestApi.layer, { timeout: "30 seconds" })("closing a table in one request", (it) => {
  const table = Effect.gen(function* () {
    const { alex, bea } = yield* users("alex", "bea");
    const group = yield* groupWith(alex, bea);
    const [alexId, beaId] = [group.myPlayerId, group.players[1]!.id];
    const venue = yield* catalogVenue(alex);
    const sessionId = ids.session();
    yield* alex.sessions.create({
      params: { tripId: group.tripId },
      payload: {
        id: sessionId,
        venueId: venue.id,
        game: "blackjack",
        playerIds: [alexId, beaId],
        notes: null,
      },
    });
    const entry = (kind: "buy_in" | "cash_out", playerId: PlayerId, amount: number) =>
      alex.ledger.addEntry({
        params: { sessionId },
        payload: {
          id: ids.entry(),
          kind,
          playerId,
          counterpartyId: null,
          amount: usd(amount),
          note: null,
          replacesEntryId: null,
        },
      });
    yield* entry("buy_in", alexId, 30000);
    yield* entry("buy_in", beaId, 20000);
    const close = (
      cashOuts: ReadonlyArray<{
        id: ReturnType<typeof ids.entry>;
        playerId: PlayerId;
        amount: number;
      }>,
    ) =>
      alex.sessions.close({
        params: { sessionId },
        payload: { cashOuts: cashOuts.map((c) => ({ ...c, amount: usd(c.amount) })) },
      });
    const get = alex.sessions.get({ params: { sessionId } });
    return { alexId, beaId, close, entry, get };
  });

  it.effect("records every cash-out and closes together", () =>
    Effect.gen(function* () {
      const { alexId, beaId, close } = yield* table;
      const cashOuts = [
        { id: ids.entry(), playerId: alexId, amount: 110000 },
        { id: ids.entry(), playerId: beaId, amount: 0 },
      ];
      const closed = yield* close(cashOuts);
      expect(closed.session.status).toBe("closed");
      expect(closed.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ playerId: alexId, net: 80000 }),
          expect.objectContaining({ playerId: beaId, net: -20000 }),
        ]),
      );
      // The same request again, as a retry would send it, changes nothing.
      const again = yield* close(cashOuts);
      expect(again.entries).toHaveLength(closed.entries.length);
    }),
  );

  it.effect("saves nothing when someone is left without a cash-out", () =>
    Effect.gen(function* () {
      const { alexId, close, get } = yield* table;
      const refused = yield* Effect.flip(
        close([{ id: ids.entry(), playerId: alexId, amount: 5000 }]),
      );
      expect(refused).toMatchObject({ _tag: "Conflict", reason: "players_not_cashed_out" });
      const after = yield* get;
      expect(after.session.status).toBe("live");
      expect(after.entries.filter((e) => e.kind === "cash_out")).toEqual([]);
    }),
  );

  it.effect("won't cash out a player twice", () =>
    Effect.gen(function* () {
      const { alexId, beaId, close, entry } = yield* table;
      yield* entry("cash_out", beaId, 1000);
      const twice = yield* Effect.flip(
        close([
          { id: ids.entry(), playerId: alexId, amount: 5000 },
          { id: ids.entry(), playerId: beaId, amount: 1000 },
        ]),
      );
      expect(twice).toMatchObject({ _tag: "InvalidRequest" });
    }),
  );
});
