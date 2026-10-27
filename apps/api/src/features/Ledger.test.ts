import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { catalogVenue, groupWith, ids, usd, users } from "../testing/fixtures.ts";
import { TestApi } from "../testing/TestApi.ts";

it.layer(TestApi.layer, { timeout: "30 seconds" })("a session from buy-in to settle up", (it) => {
  it.effect("tracks results, debts and settlements", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const [alexId, beaId] = [group.myPlayerId, group.players[1]!.id];
      const venue = yield* catalogVenue(alex);
      const sessionId = ids.session();
      yield* alex.sessions.create({
        params: { groupId: group.group.id },
        payload: {
          id: sessionId,
          venueId: venue.id,
          game: "blackjack",
          playerIds: [alexId, beaId],
          notes: null,
        },
      });

      const add = (
        kind: "buy_in" | "cash_out",
        playerId: typeof alexId,
        amount: number,
        counterpartyId: typeof alexId | null = null,
      ) =>
        alex.ledger.addEntry({
          params: { sessionId },
          payload: {
            id: ids.entry(),
            kind,
            playerId,
            counterpartyId,
            amount: usd(amount),
            note: null,
            replacesEntryId: null,
          },
        });
      // Bea covers Alex's second buy-in, and Alex holds Bea's cash at the end.
      yield* add("buy_in", alexId, 10000);
      yield* add("buy_in", alexId, 5000, beaId);
      yield* add("buy_in", beaId, 20000);
      yield* add("cash_out", alexId, 32000);

      const early = yield* Effect.flip(alex.sessions.close({ params: { sessionId }, payload: {} }));
      expect(early).toMatchObject({ _tag: "Conflict", reason: "players_not_cashed_out" });

      yield* add("cash_out", beaId, 12000, alexId);
      const closed = yield* alex.sessions.close({ params: { sessionId }, payload: {} });
      expect(closed.session.status).toBe("closed");
      expect(closed.results).toEqual(
        expect.arrayContaining([
          { playerId: alexId, buyIn: 15000, cashOut: 32000, adjustment: 0, net: 17000 },
          { playerId: beaId, buyIn: 20000, cashOut: 12000, adjustment: 0, net: -8000 },
        ]),
      );

      // Alex owes Bea 5,000 for the buy-in and 12,000 for the cash Alex kept.
      const detail = yield* bea.groups.get({ params: { groupId: group.group.id } });
      expect(detail.balances).toEqual(
        expect.arrayContaining([
          { playerId: alexId, amount: -17000 },
          { playerId: beaId, amount: 17000 },
        ]),
      );
      expect(detail.transfers).toEqual([{ from: alexId, to: beaId, amount: 17000 }]);

      yield* alex.ledger.recordSettlement({
        params: { groupId: group.group.id },
        payload: {
          id: ids.entry(),
          fromPlayerId: alexId,
          toPlayerId: beaId,
          amount: usd(17000),
          note: "Venmo",
        },
      });
      const settled = yield* bea.groups.get({ params: { groupId: group.group.id } });
      expect(settled.balances).toEqual([]);
      expect(settled.transfers).toEqual([]);
      expect(settled.settlements).toHaveLength(1);
    }),
  );
});

it.layer(TestApi.layer, { timeout: "30 seconds" })("ledger rules", (it) => {
  const setup = Effect.gen(function* () {
    const { alex, bea, cal } = yield* users("alex", "bea", "cal");
    const group = yield* groupWith(alex, bea, cal);
    const [alexId, beaId, calId] = group.players.map((player) => player.id);
    const venue = yield* catalogVenue(alex);
    const sessionId = ids.session();
    yield* alex.sessions.create({
      params: { groupId: group.group.id },
      payload: {
        id: sessionId,
        venueId: venue.id,
        game: "roulette",
        playerIds: [alexId!, beaId!],
        notes: null,
      },
    });
    const entry = (
      client: typeof alex,
      fields: {
        kind: "buy_in" | "cash_out" | "adjustment";
        playerId: typeof alexId;
        amount: number;
        counterpartyId?: typeof alexId;
        replacesEntryId?: ReturnType<typeof ids.entry>;
      },
    ) =>
      client.ledger.addEntry({
        params: { sessionId },
        payload: {
          id: ids.entry(),
          kind: fields.kind,
          playerId: fields.playerId!,
          counterpartyId: fields.counterpartyId ?? null,
          amount: usd(fields.amount),
          note: null,
          replacesEntryId: fields.replacesEntryId ?? null,
        },
      });
    return {
      alex,
      bea,
      cal,
      group,
      alexId: alexId!,
      beaId: beaId!,
      calId: calId!,
      sessionId,
      entry,
    };
  });

  it.effect("corrects an entry by voiding it and writing a new one", () =>
    Effect.gen(function* () {
      const { alex, alexId, sessionId, entry } = yield* setup;
      const wrong = yield* entry(alex, { kind: "buy_in", playerId: alexId, amount: 1000 });
      const right = yield* entry(alex, {
        kind: "buy_in",
        playerId: alexId,
        amount: 10000,
        replacesEntryId: wrong.id,
      });
      const session = yield* alex.sessions.get({ params: { sessionId } });

      expect(session.entries.find((e) => e.id === wrong.id)).toMatchObject({
        voidReason: "Corrected",
      });
      expect(session.entries.find((e) => e.id === right.id)?.voidedAt).toBeNull();
      expect(session.results).toContainEqual(
        expect.objectContaining({ playerId: alexId, buyIn: 10000 }),
      );
    }),
  );

  it.effect("lets the writer, the player or an admin void an entry, and nobody else", () =>
    Effect.gen(function* () {
      const { alex, bea, cal, beaId, entry } = yield* setup;
      const beas = yield* entry(alex, { kind: "buy_in", playerId: beaId, amount: 2000 });
      const reason = { reason: null };
      expect(
        yield* Effect.flip(cal.ledger.voidEntry({ params: { entryId: beas.id }, payload: reason })),
      ).toMatchObject({
        _tag: "Forbidden",
        reason: "not_your_entry",
      });
      const voided = yield* bea.ledger.voidEntry({
        params: { entryId: beas.id },
        payload: { reason: "Wrong table" },
      });
      expect(voided).toMatchObject({ voidReason: "Wrong table" });
      expect(voided.voidedAt).not.toBeNull();
      expect(
        yield* Effect.flip(
          alex.ledger.voidEntry({ params: { entryId: beas.id }, payload: reason }),
        ),
      ).toMatchObject({
        reason: "entry_voided",
      });
    }),
  );

  it.effect("adds a player to the session when they get an entry", () =>
    Effect.gen(function* () {
      const { alex, calId, sessionId, entry } = yield* setup;
      yield* entry(alex, { kind: "buy_in", playerId: calId, amount: 500 });
      const session = yield* alex.sessions.get({ params: { sessionId } });
      expect(session.playerIds).toContain(calId);
    }),
  );

  it.effect("returns the stored entry when a write is retried", () =>
    Effect.gen(function* () {
      const { alex, alexId, sessionId } = yield* setup;
      const payload = {
        id: ids.entry(),
        kind: "buy_in" as const,
        playerId: alexId,
        counterpartyId: null,
        amount: usd(5000),
        note: null,
        replacesEntryId: null,
      };
      const first = yield* alex.ledger.addEntry({ params: { sessionId }, payload });
      const retry = yield* alex.ledger.addEntry({
        params: { sessionId },
        payload: { ...payload, amount: usd(9999) },
      });
      expect(retry).toEqual(first);
      const session = yield* alex.sessions.get({ params: { sessionId } });
      expect(session.entries).toHaveLength(1);
    }),
  );

  it.effect("returns the stored entry when a write is retried after the session closed", () =>
    Effect.gen(function* () {
      const { alex, alexId, sessionId } = yield* setup;
      const payload = {
        id: ids.entry(),
        kind: "cash_out" as const,
        playerId: alexId,
        counterpartyId: null,
        amount: usd(700),
        note: null,
        replacesEntryId: null,
      };
      const first = yield* alex.ledger.addEntry({ params: { sessionId }, payload });
      yield* alex.sessions.close({ params: { sessionId }, payload: {} });
      expect(yield* alex.ledger.addEntry({ params: { sessionId }, payload })).toEqual(first);
    }),
  );

  it.effect("rejects entries that break the ledger's rules", () =>
    Effect.gen(function* () {
      const { alex, group, alexId, beaId, entry } = yield* setup;
      expect(
        yield* Effect.flip(
          entry(alex, { kind: "adjustment", playerId: alexId, amount: 100, counterpartyId: beaId }),
        ),
      ).toMatchObject({ _tag: "InvalidRequest" });
      expect(
        yield* Effect.flip(
          entry(alex, { kind: "buy_in", playerId: alexId, amount: 100, counterpartyId: alexId }),
        ),
      ).toMatchObject({ _tag: "InvalidRequest" });
      expect(
        yield* Effect.flip(
          alex.ledger.recordSettlement({
            params: { groupId: group.group.id },
            payload: {
              id: ids.entry(),
              fromPlayerId: alexId,
              toPlayerId: alexId,
              amount: usd(100),
              note: null,
            },
          }),
        ),
      ).toMatchObject({ _tag: "InvalidRequest" });
    }),
  );

  it.effect("rejects players from another group", () =>
    Effect.gen(function* () {
      const { alex, entry } = yield* setup;
      const outsider = yield* groupWith(alex);
      expect(
        yield* Effect.flip(
          entry(alex, { kind: "buy_in", playerId: outsider.myPlayerId, amount: 100 }),
        ),
      ).toMatchObject({ reason: "player_not_in_group" });
    }),
  );

  it.effect("locks a closed session until an admin reopens it", () =>
    Effect.gen(function* () {
      const { alex, bea, alexId, sessionId, entry } = yield* setup;
      const buyIn = yield* entry(alex, { kind: "buy_in", playerId: alexId, amount: 1000 });
      yield* entry(alex, { kind: "cash_out", playerId: alexId, amount: 2000 });
      yield* alex.sessions.close({ params: { sessionId }, payload: {} });

      expect(
        yield* Effect.flip(entry(alex, { kind: "adjustment", playerId: alexId, amount: 50 })),
      ).toMatchObject({
        reason: "session_closed",
      });
      expect(
        yield* Effect.flip(
          alex.ledger.voidEntry({ params: { entryId: buyIn.id }, payload: { reason: null } }),
        ),
      ).toMatchObject({ reason: "session_closed" });
      expect(yield* Effect.flip(bea.sessions.reopen({ params: { sessionId } }))).toMatchObject({
        reason: "admins_only",
      });

      const reopened = yield* alex.sessions.reopen({ params: { sessionId } });
      expect(reopened.session).toMatchObject({ status: "live", endedAt: null });
      yield* entry(alex, { kind: "adjustment", playerId: alexId, amount: -50 });
    }),
  );
});
