import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";
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
      expect(closed.session.endedAt).toEqual(yield* DateTime.now);
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

it.layer(TestApi.layer, { timeout: "30 seconds" })("correcting historical sessions", (it) => {
  const historical = (minutes = 120) =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const venue = yield* catalogVenue(alex);
      const sessionId = ids.session();
      const startedAt = DateTime.subtract(yield* DateTime.now, { days: 1 });
      const endedAt = DateTime.add(startedAt, { minutes });
      yield* alex.sessions.create({
        params: { tripId: group.tripId },
        payload: {
          id: sessionId,
          venueId: venue.id,
          game: "blackjack",
          playerIds: [group.myPlayerId],
          notes: null,
          startedAt,
        },
      });
      yield* alex.ledger.addEntry({
        params: { sessionId },
        payload: {
          id: ids.entry(),
          kind: "buy_in",
          playerId: group.myPlayerId,
          counterpartyId: null,
          amount: usd(10000),
          note: null,
          replacesEntryId: null,
        },
      });
      const cashOutId = ids.entry();
      yield* alex.sessions.close({
        params: { sessionId },
        payload: {
          endedAt,
          cashOuts: [{ id: cashOutId, playerId: group.myPlayerId, amount: usd(12000) }],
        },
      });
      return { alex, bea, group, venue, sessionId, startedAt, endedAt, cashOutId };
    });

  it.effect("keeps the original end and stats after a correction in an ended trip", () =>
    Effect.gen(function* () {
      const { alex, group, venue, sessionId, endedAt, cashOutId } = yield* historical();
      const params = { sessionId };
      yield* alex.trips.end({
        params: { tripId: group.tripId },
        payload: { endedAt: DateTime.add(endedAt, { days: 1 }) },
      });
      yield* TestClock.adjust("20 days");
      yield* alex.sessions.reopen({ params });
      yield* alex.sessions.reopen({ params });
      yield* alex.ledger.voidEntry({ params: { entryId: cashOutId }, payload: { reason: "Typo" } });
      const close = {
        params,
        payload: {
          cashOuts: [{ id: ids.entry(), playerId: group.myPlayerId, amount: usd(15000) }],
        },
      };
      const corrected = yield* alex.sessions.close(close);
      expect(corrected.session.endedAt).toEqual(endedAt);
      expect(corrected.entries.find((entry) => entry.id === cashOutId)?.voidedAt).not.toBeNull();
      expect(
        corrected.entries.find((entry) => entry.id === close.payload.cashOuts[0]!.id)?.occurredAt,
      ).toEqual(endedAt);
      expect(corrected.results).toEqual([
        expect.objectContaining({ playerId: group.myPlayerId, net: 5000 }),
      ]);
      const again = yield* alex.sessions.close(close);
      expect(again.entries).toEqual(corrected.entries);
      expect(again.session.endedAt).toEqual(endedAt);
      const stats = yield* alex.groups.stats({ params: { groupId: group.group.id } });
      expect(stats.minutesPlayed).toBe(120);
      expect(stats.byPlayer).toEqual([expect.objectContaining({ net: 5000 })]);
      const refused = yield* Effect.flip(
        alex.sessions.create({
          params: { tripId: group.tripId },
          payload: {
            id: ids.session(),
            venueId: venue.id,
            game: "blackjack",
            playerIds: [group.myPlayerId],
            notes: null,
          },
        }),
      );
      expect(refused).toMatchObject({ reason: "trip_ended" });
    }),
  );

  it.effect(
    "allows an explicit end override and preserves the latest end on the next correction",
    () =>
      Effect.gen(function* () {
        const { alex, sessionId, startedAt, endedAt } = yield* historical();
        const params = { sessionId };
        yield* alex.sessions.reopen({ params });
        const invalid = yield* Effect.flip(
          alex.sessions.close({
            params,
            payload: { endedAt: DateTime.subtract(startedAt, { minutes: 1 }) },
          }),
        );
        expect(invalid).toMatchObject({ _tag: "InvalidRequest" });
        expect((yield* alex.sessions.get({ params })).session.status).toBe("live");
        const later = DateTime.add(endedAt, { hours: 1 });
        expect(
          (yield* alex.sessions.close({ params, payload: { endedAt: later } })).session.endedAt,
        ).toEqual(later);
        yield* alex.sessions.reopen({ params });
        expect((yield* alex.sessions.close({ params, payload: {} })).session.endedAt).toEqual(
          later,
        );
      }),
  );

  it.effect("preserves an imported session whose start and end are equal", () =>
    Effect.gen(function* () {
      const { alex, sessionId, startedAt } = yield* historical(0);
      const params = { sessionId };
      yield* TestClock.adjust("20 days");
      yield* alex.sessions.reopen({ params });
      const corrected = yield* alex.sessions.close({ params, payload: {} });
      expect(corrected.session.startedAt).toEqual(startedAt);
      expect(corrected.session.endedAt).toEqual(startedAt);
    }),
  );

  it.effect("still requires an admin to reopen", () =>
    Effect.gen(function* () {
      const { bea, sessionId, endedAt } = yield* historical();
      const params = { sessionId };
      expect(yield* Effect.flip(bea.sessions.reopen({ params }))).toMatchObject({
        reason: "admins_only",
      });
      expect((yield* bea.sessions.get({ params })).session.endedAt).toEqual(endedAt);
    }),
  );

  it.effect("serializes competing closes without duplicating cash-outs", () =>
    Effect.gen(function* () {
      const { alex, group, sessionId, endedAt, cashOutId } = yield* historical();
      const params = { sessionId };
      yield* alex.sessions.reopen({ params });
      yield* alex.ledger.voidEntry({ params: { entryId: cashOutId }, payload: { reason: "Typo" } });
      yield* Effect.all(
        [14000, 15000].map((amount) =>
          alex.sessions.close({
            params,
            payload: {
              cashOuts: [{ id: ids.entry(), playerId: group.myPlayerId, amount: usd(amount) }],
            },
          }),
        ),
        { concurrency: "unbounded" },
      );
      const after = yield* alex.sessions.get({ params });
      expect(after.session.endedAt).toEqual(endedAt);
      const cashOuts = after.entries.filter(
        (entry) => entry.kind === "cash_out" && entry.voidedAt === null,
      );
      expect(cashOuts).toHaveLength(1);
      expect([14000, 15000]).toContain(cashOuts[0]!.amount);
    }),
  );
});
