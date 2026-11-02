import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { CurrencyCode } from "@stacks/contracts";

import { catalogVenue, groupWith, ids, usd, users } from "../testing/fixtures.ts";
import { TestApi } from "../testing/TestApi.ts";

it.layer(TestApi.layer, { timeout: "30 seconds" })("groups", (it) => {
  it.effect("makes the creator the owner and treats a retried create as the same group", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const payload = {
        id: ids.group(),
        name: "Vegas crew",
        currency: CurrencyCode.make("USD"),
        displayName: "Alex",
      };
      const first = yield* alex.groups.create({ payload });
      const retry = yield* alex.groups.create({ payload });

      expect(first.role).toBe("owner");
      expect(first.players).toEqual([
        expect.objectContaining({ id: first.myPlayerId, displayName: "Alex", role: "owner" }),
      ]);
      expect(retry.myPlayerId).toBe(first.myPlayerId);
      expect(yield* Effect.flip(bea.groups.create({ payload }))).toMatchObject({
        _tag: "Conflict",
        reason: "id_taken",
      });
    }),
  );

  it.effect("keeps a group's ledger away from people outside it", () =>
    Effect.gen(function* () {
      const { alex, eve } = yield* users("alex", "eve");
      const group = yield* groupWith(alex);
      const error = yield* Effect.flip(eve.groups.get({ params: { groupId: group.group.id } }));
      expect(error).toMatchObject({ _tag: "Forbidden", reason: "not_a_member" });
      expect(yield* eve.groups.list()).toEqual([]);
    }),
  );

  it.effect("lists each group with the member's balance", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const beaId = group.players[1]!.id;
      yield* alex.ledger.recordSettlement({
        params: { tripId: group.tripId },
        payload: {
          id: ids.entry(),
          fromPlayerId: group.myPlayerId,
          toPlayerId: beaId,
          amount: usd(2500),
          note: null,
        },
      });
      const [listed] = yield* bea.groups.list();
      expect(listed).toMatchObject({ role: "member", myPlayerId: beaId, myBalance: -2500 });
    }),
  );

  it.effect("won't let someone leave while they owe or are owed", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const groupId = group.group.id;
      yield* alex.ledger.recordSettlement({
        params: { tripId: group.tripId },
        payload: {
          id: ids.entry(),
          fromPlayerId: group.myPlayerId,
          toPlayerId: group.players[1]!.id,
          amount: usd(100),
          note: null,
        },
      });
      expect(yield* Effect.flip(bea.groups.leave({ params: { groupId } }))).toMatchObject({
        reason: "balance_not_settled",
      });
    }),
  );

  it.effect("keeps the owner until everyone else has gone", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const groupId = group.group.id;
      expect(yield* Effect.flip(alex.groups.leave({ params: { groupId } }))).toMatchObject({
        reason: "last_owner",
      });
      yield* bea.groups.leave({ params: { groupId } });
      yield* alex.groups.leave({ params: { groupId } });
      expect(yield* alex.groups.list()).toEqual([]);
    }),
  );

  it.effect("lets admins remove members but only the owner manage admins", () =>
    Effect.gen(function* () {
      const { alex, bea, cal, dee } = yield* users("alex", "bea", "cal", "dee");
      const group = yield* groupWith(alex, bea, cal, dee);
      const groupId = group.group.id;
      const userOf = (index: number) => group.players[index]!.userId!;

      expect(
        yield* Effect.flip(
          bea.groups.setRole({
            params: { groupId, userId: userOf(2) },
            payload: { role: "admin" },
          }),
        ),
      ).toMatchObject({ _tag: "Forbidden", reason: "owner_only" });
      yield* alex.groups.setRole({
        params: { groupId, userId: userOf(1) },
        payload: { role: "admin" },
      });

      yield* bea.groups.removeMember({ params: { groupId, userId: userOf(3) } });
      expect(
        yield* Effect.flip(cal.groups.removeMember({ params: { groupId, userId: userOf(1) } })),
      ).toMatchObject({ _tag: "Forbidden", reason: "admins_only" });
      expect(
        yield* Effect.flip(bea.groups.removeMember({ params: { groupId, userId: userOf(0) } })),
      ).toMatchObject({ _tag: "Forbidden", reason: "owner_only" });

      const after = yield* alex.groups.get({ params: { groupId } });
      expect(after.players.map((player) => player.role)).toEqual([
        "owner",
        "admin",
        "member",
        null,
      ]);
    }),
  );

  it.effect("keeps a removed member's history in the ledger", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const groupId = group.group.id;
      const venue = yield* catalogVenue(alex);
      const sessionId = ids.session();
      yield* alex.sessions.create({
        params: { tripId: group.tripId },
        payload: {
          id: sessionId,
          venueId: venue.id,
          game: "craps",
          playerIds: [group.players[1]!.id],
          notes: null,
        },
      });
      yield* alex.groups.removeMember({ params: { groupId, userId: group.players[1]!.userId! } });
      const session = yield* alex.sessions.get({ params: { sessionId } });
      expect(session.playerIds).toEqual([group.players[1]!.id]);
    }),
  );
});

it.layer(TestApi.layer, { timeout: "30 seconds" })("stats", (it) => {
  it.effect("adds up closed sessions by player, game and venue", () =>
    Effect.gen(function* () {
      const { alex } = yield* users("alex");
      const group = yield* groupWith(alex);
      const groupId = group.group.id;
      const me = group.myPlayerId;
      const venue = yield* catalogVenue(alex);
      const play = (game: "craps" | "slots", buyIn: number, cashOut: number | null) =>
        Effect.gen(function* () {
          const sessionId = ids.session();
          yield* alex.sessions.create({
            params: { tripId: group.tripId },
            payload: { id: sessionId, venueId: venue.id, game, playerIds: [me], notes: null },
          });
          const entry = (kind: "buy_in" | "cash_out", amount: number) =>
            alex.ledger.addEntry({
              params: { sessionId },
              payload: {
                id: ids.entry(),
                kind,
                playerId: me,
                counterpartyId: null,
                amount: usd(amount),
                note: null,
                replacesEntryId: null,
              },
            });
          yield* entry("buy_in", buyIn);
          if (cashOut !== null) {
            yield* entry("cash_out", cashOut);
            yield* alex.sessions.close({ params: { sessionId }, payload: {} });
          }
        });
      yield* play("craps", 10000, 25000);
      yield* play("craps", 10000, 0);
      yield* play("slots", 5000, 6000);
      yield* play("slots", 99900, null);

      const stats = yield* alex.groups.stats({ params: { groupId } });
      expect(stats.sessionCount).toBe(3);
      expect(stats.byPlayer).toEqual([
        { playerId: me, buyIn: 25000, cashOut: 31000, adjustment: 0, net: 6000 },
      ]);
      expect(stats.byGame).toEqual(
        expect.arrayContaining([
          { key: "craps", sessionCount: 2, results: [expect.objectContaining({ net: 5000 })] },
          { key: "slots", sessionCount: 1, results: [expect.objectContaining({ net: 1000 })] },
        ]),
      );
      expect(stats.byVenue).toEqual([
        {
          key: expect.objectContaining({ id: venue.id }),
          sessionCount: 3,
          results: [expect.objectContaining({ net: 6000 })],
        },
      ]);
      // Closed sessions only, oldest first.
      expect(stats.bySession.map((s) => s.results.map((r) => r.net))).toEqual([
        [15000],
        [-10000],
        [1000],
      ]);
    }),
  );
});
