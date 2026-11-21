import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { catalogVenue, groupWith, ids, users } from "../testing/fixtures.test-utils.ts";
import { finishHistoricalSession, seedSession } from "../testing/legacySessions.test-utils.ts";
import { TestApi } from "../testing/TestApi.test-utils.ts";

it.layer(TestApi.layer)("historical seats", (it) => {
  it.effect("keeps seat changes, table size and the high-limit flag visible", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { alex, bea, eve } = yield* users("alex", "bea", "eve");
      const { tripId, myPlayerId: alexId, players } = yield* groupWith(alex, bea);
      const beaId = players.find((player) => player.id !== alexId)!.id;
      const venue = yield* catalogVenue(alex);
      const startedAt = DateTime.makeUnsafe("2026-10-21T20:00:00Z");

      const sessionId = yield* seedSession(tripId, {
        id: ids.session(),
        venueId: venue.id,
        game: "blackjack",
        playerIds: [alexId, beaId],
        notes: null,
        highLimit: true,
        tableSeats: 7,
        startedAt,
      });

      const events = [
        [alexId, 7],
        [beaId, 4],
        [alexId, 6],
        [beaId, null],
      ] as const;

      for (const [index, [playerId, seat]] of events.entries()) {
        const occurredAt = new Date(Date.UTC(2026, 9, 21, 20, index));
        yield* sql`
          insert into seatings (id, session_id, group_id, player_id, seat, occurred_at, created_by)
          select ${ids.seating()}, s.id, s.group_id, ${playerId}, ${seat}, ${occurredAt}, s.created_by
          from sessions s where s.id = ${sessionId}
        `;
      }

      yield* finishHistoricalSession(sessionId, {
        endedAt: DateTime.makeUnsafe("2026-10-21T21:00:00Z"),
      });

      const read = { params: { sessionId } };
      const detail = yield* bea.sessions.get(read);
      expect(detail.session).toMatchObject({ tableSeats: 7, highLimit: true, status: "closed" });
      expect(detail.seatings.map((event) => [event.playerId, event.seat])).toEqual(events);
      {
        const received = yield* Effect.flip(eve.sessions.get(read));
        expect(received._tag).toBe("Forbidden");
        expect(received).toMatchObject({ reason: "not_a_member" });
      }
    }),
  );
});
