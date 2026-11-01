import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { PlayerId } from "@stacks/contracts";

import { catalogVenue, groupWith, ids, usd, users } from "../testing/fixtures.ts";
import { TestApi } from "../testing/TestApi.ts";

it.layer(TestApi.layer, { timeout: "30 seconds" })("seats at a table", (it) => {
  const table = (game: "blackjack" | "slots") =>
    Effect.gen(function* () {
      const { alex, bea, cal } = yield* users("alex", "bea", "cal");
      const group = yield* groupWith(alex, bea);
      const [alexId, beaId] = [group.myPlayerId, group.players[1]!.id];
      const venue = yield* catalogVenue(alex);
      const sessionId = ids.session();
      yield* alex.sessions.create({
        params: { tripId: group.tripId },
        payload: {
          id: sessionId,
          venueId: venue.id,
          game,
          playerIds: [alexId, beaId],
          notes: null,
        },
      });
      const sit = (by: typeof alex, playerId: PlayerId, seat: number | null, id = ids.seating()) =>
        by.sessions.seat({ params: { sessionId }, payload: { id, playerId, seat } });
      return { alex, bea, cal, alexId, beaId, sessionId, sit };
    });
  const seats = (detail: {
    seatings: ReadonlyArray<{ playerId: PlayerId; seat: number | null }>;
  }) => detail.seatings.map((s) => [s.playerId, s.seat]);

  it.effect("sits, moves and stands players, one to a seat", () =>
    Effect.gen(function* () {
      const { bea, alexId, beaId, sessionId, sit } = yield* table("blackjack");
      yield* bea.sessions.setTable({ params: { sessionId }, payload: { seats: 7 } });
      yield* sit(bea, alexId, 7);
      yield* sit(bea, beaId, 4);
      const taken = yield* Effect.flip(sit(bea, beaId, 7));
      expect(taken).toMatchObject({ _tag: "Conflict", reason: "seat_taken" });

      yield* sit(bea, alexId, 6);
      const moved = yield* sit(bea, beaId, 7);
      expect(seats(moved)).toEqual([
        [alexId, 7],
        [beaId, 4],
        [alexId, 6],
        [beaId, 7],
      ]);
      // Sitting where you already are, or standing when you're up, records nothing.
      yield* sit(bea, beaId, 7);
      const stood = yield* sit(bea, alexId, null);
      yield* sit(bea, alexId, null);
      const after = yield* sit(bea, alexId, 2);
      expect(seats(after).slice(4)).toEqual([
        [alexId, null],
        [alexId, 2],
      ]);
      expect(stood.seatings).toHaveLength(5);
    }),
  );

  it.effect("sizes the table, keeping everyone in a seat that still exists", () =>
    Effect.gen(function* () {
      const { bea, alexId, sessionId, sit } = yield* table("blackjack");
      const setTable = (seats: number) =>
        bea.sessions.setTable({ params: { sessionId }, payload: { seats } });
      // A new table is the usual 5 seats until someone picks another size.
      const small = yield* Effect.flip(sit(bea, alexId, 6));
      expect(small).toMatchObject({ _tag: "InvalidRequest", message: "This table has 5 seats." });
      yield* setTable(7);
      expect((yield* sit(bea, alexId, 6)).session.tableSeats).toBe(7);

      const odd = yield* Effect.flip(setTable(4));
      expect(odd).toMatchObject({ _tag: "InvalidRequest" });
      const tooSmall = yield* Effect.flip(setTable(5));
      expect(tooSmall).toMatchObject({
        _tag: "InvalidRequest",
        message: "Move whoever's in seat 6 first.",
      });

      yield* sit(bea, alexId, 2);
      expect((yield* setTable(5)).session.tableSeats).toBe(5);
      const gone = yield* Effect.flip(sit(bea, alexId, 6));
      expect(gone).toMatchObject({ _tag: "InvalidRequest", message: "This table has 5 seats." });
    }),
  );

  it.effect("labels a high-limit table, even once it's closed", () =>
    Effect.gen(function* () {
      const { alex, cal, sessionId } = yield* table("blackjack");
      yield* alex.sessions.close({ params: { sessionId }, payload: {} });
      const marked = yield* alex.sessions.setHighLimit({
        params: { sessionId },
        payload: { highLimit: true },
      });
      expect(marked.session.highLimit).toBe(true);
      const stranger = yield* Effect.flip(
        cal.sessions.setHighLimit({ params: { sessionId }, payload: { highLimit: false } }),
      );
      expect(stranger).toMatchObject({ _tag: "Forbidden" });
    }),
  );

  it.effect("treats a retry as the same seating", () =>
    Effect.gen(function* () {
      const { alex, alexId, sit } = yield* table("blackjack");
      const id = ids.seating();
      yield* sit(alex, alexId, 3, id);
      const again = yield* sit(alex, alexId, 3, id);
      expect(again.seatings).toHaveLength(1);
    }),
  );

  it.effect("only seats people at the table, at tables with seats", () =>
    Effect.gen(function* () {
      const { alex, cal, alexId, sit } = yield* table("blackjack");
      const tooFar = yield* Effect.flip(sit(alex, alexId, 8));
      expect(tooFar).toMatchObject({ _tag: "InvalidRequest" });
      const stranger = yield* Effect.flip(sit(cal, alexId, 1));
      expect(stranger).toMatchObject({ _tag: "Forbidden", reason: "not_a_member" });

      const slots = yield* table("slots");
      const noSeats = yield* Effect.flip(slots.sit(slots.alex, slots.alexId, 1));
      expect(noSeats).toMatchObject({ _tag: "InvalidRequest" });
    }),
  );

  it.effect("freezes the table once the session closes", () =>
    Effect.gen(function* () {
      const { alex, alexId, beaId, sessionId, sit } = yield* table("blackjack");
      yield* sit(alex, alexId, 5);
      for (const [kind, amount] of [
        ["buy_in", 30000],
        ["cash_out", 110000],
      ] as const)
        yield* alex.ledger.addEntry({
          params: { sessionId },
          payload: {
            id: ids.entry(),
            kind,
            playerId: alexId,
            counterpartyId: null,
            amount: usd(amount),
            note: null,
            replacesEntryId: null,
          },
        });
      const closed = yield* alex.sessions.close({ params: { sessionId }, payload: {} });
      expect(seats(closed)).toEqual([[alexId, 5]]);
      const late = yield* Effect.flip(sit(alex, beaId, 1));
      expect(late).toMatchObject({ _tag: "Conflict", reason: "session_closed" });

      // Stats credit the result to the seat it was played from.
      const stats = yield* alex.groups.stats({ params: { groupId: closed.session.groupId } });
      expect(stats.bySeat).toEqual([
        {
          key: 5,
          sessionCount: 1,
          results: [{ playerId: alexId, buyIn: 30000, cashOut: 110000, adjustment: 0, net: 80000 }],
        },
      ]);
    }),
  );

  it.effect("refuses a player who isn't in the session", () =>
    Effect.gen(function* () {
      const { alex, sessionId } = yield* table("blackjack");
      const group = yield* alex.groups.list();
      const guest = ids.player();
      yield* alex.guests.add({
        params: { groupId: group[0]!.group.id },
        payload: { id: guest, displayName: "Dee" },
      });
      const result = yield* Effect.flip(
        alex.sessions.seat({
          params: { sessionId },
          payload: { id: ids.seating(), playerId: guest, seat: 1 },
        }),
      );
      expect(result).toMatchObject({ _tag: "Conflict", reason: "player_not_in_session" });
    }),
  );
});
