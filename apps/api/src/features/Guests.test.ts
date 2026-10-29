import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { catalogVenue, groupWith, ids, usd, users } from "../testing/fixtures.ts";
import { TestApi } from "../testing/TestApi.ts";

it.layer(TestApi.layer, { timeout: "30 seconds" })("guests", (it) => {
  it.effect("hands a guest's history to whoever claims it", () =>
    Effect.gen(function* () {
      const { alex, gus } = yield* users("alex", "gus");
      const group = yield* groupWith(alex);
      const groupId = group.group.id;
      const guestId = ids.player();
      const withGuest = yield* alex.guests.add({
        params: { groupId },
        payload: { id: guestId, displayName: "Gus" },
      });
      const guest = withGuest.players.find((player) => player.id === guestId)!;
      expect(guest).toMatchObject({ userId: null, role: null });

      yield* alex.ledger.recordSettlement({
        params: { tripId: group.tripId },
        payload: {
          id: ids.entry(),
          fromPlayerId: group.myPlayerId,
          toPlayerId: guestId,
          amount: usd(4000),
          note: null,
        },
      });
      expect(yield* gus.guests.previewClaim({ params: { code: guest.claimCode! } })).toMatchObject({
        playerId: guestId,
        displayName: "Gus",
      });

      const claimed = yield* gus.guests.claim({ params: { code: guest.claimCode! } });
      expect(claimed.myPlayerId).toBe(guestId);
      expect(claimed.role).toBe("member");
      const trip = yield* gus.trips.get({ params: { tripId: group.tripId } });
      expect(trip.balances).toContainEqual({ playerId: guestId, amount: -4000 });
      expect(
        yield* Effect.flip(gus.guests.previewClaim({ params: { code: guest.claimCode! } })),
      ).toMatchObject({
        _tag: "NotFound",
      });
    }),
  );

  it.effect("drops a member's empty player when they claim a guest", () =>
    Effect.gen(function* () {
      const { alex, gus } = yield* users("alex", "gus");
      const group = yield* groupWith(alex, gus);
      const groupId = group.group.id;
      const guestId = ids.player();
      const withGuest = yield* alex.guests.add({
        params: { groupId },
        payload: { id: guestId, displayName: "Gus" },
      });
      const code = withGuest.players.find((player) => player.id === guestId)!.claimCode!;

      const claimed = yield* gus.guests.claim({ params: { code } });
      expect(claimed.myPlayerId).toBe(guestId);
      expect(claimed.players).toHaveLength(2);
    }),
  );

  it.effect("refuses a claim that would merge two histories", () =>
    Effect.gen(function* () {
      const { alex, gus } = yield* users("alex", "gus");
      const group = yield* groupWith(alex, gus);
      const groupId = group.group.id;
      const venue = yield* catalogVenue(alex);
      yield* alex.sessions.create({
        params: { tripId: group.tripId },
        payload: {
          id: ids.session(),
          venueId: venue.id,
          game: "slots",
          playerIds: [group.players[1]!.id],
          notes: null,
        },
      });
      const guestId = ids.player();
      const withGuest = yield* alex.guests.add({
        params: { groupId },
        payload: { id: guestId, displayName: "Gus" },
      });
      const code = withGuest.players.find((player) => player.id === guestId)!.claimCode!;

      expect(yield* Effect.flip(gus.guests.claim({ params: { code } }))).toMatchObject({
        reason: "claim_has_history",
      });
    }),
  );
});
