import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { catalogVenue, groupWith, ids, owe, users } from "../testing/fixtures.ts";
import { TestApi } from "../testing/TestApi.ts";
import { seedSession } from "../testing/legacySessions.ts";

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

      yield* owe(alex, group, guestId, group.myPlayerId, 4000);
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

  it.effect("refuses a claim from someone already in the group", () =>
    Effect.gen(function* () {
      const { alex, gus, zed } = yield* users("alex", "gus", "zed");
      const group = yield* groupWith(alex, gus);
      const groupId = group.group.id;
      const guestId = ids.player();
      const withGuest = yield* alex.guests.add({
        params: { groupId },
        payload: { id: guestId, displayName: "Jonah" },
      });
      const code = withGuest.players.find((player) => player.id === guestId)!.claimCode!;

      expect(yield* zed.guests.previewClaim({ params: { code } })).toMatchObject({
        alreadyMember: false,
      });
      for (const member of [alex, gus]) {
        expect(yield* member.guests.previewClaim({ params: { code } })).toMatchObject({
          alreadyMember: true,
        });
        expect(yield* Effect.flip(member.guests.claim({ params: { code } }))).toMatchObject({
          reason: "claim_already_member",
        });
      }

      const after = yield* alex.groups.get({ params: { groupId } });
      expect(after.myPlayerId).toBe(group.myPlayerId);
      expect(after.players.map((player) => player.displayName).toSorted()).toEqual([
        "Jonah",
        "Member 1",
        "Owner",
      ]);
      expect(after.players.find((player) => player.id === guestId)).toMatchObject({
        userId: null,
        claimCode: code,
      });
    }),
  );

  it.effect("drops a returning member's empty player when they claim a guest", () =>
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
      yield* gus.groups.leave({ params: { groupId } });

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
      yield* seedSession(group.tripId, {
        id: ids.session(),
        venueId: venue.id,
        game: "slots",
        playerIds: [group.players[1]!.id],
        notes: null,
      });
      const guestId = ids.player();
      const withGuest = yield* alex.guests.add({
        params: { groupId },
        payload: { id: guestId, displayName: "Gus" },
      });
      const code = withGuest.players.find((player) => player.id === guestId)!.claimCode!;
      yield* gus.groups.leave({ params: { groupId } });

      expect(yield* Effect.flip(gus.guests.claim({ params: { code } }))).toMatchObject({
        reason: "claim_has_history",
      });
    }),
  );
});
