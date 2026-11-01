import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";

import { groupWith, ids, users } from "../testing/fixtures.ts";
import { TestApi } from "../testing/TestApi.ts";

it.layer(TestApi.layer, { timeout: "30 seconds" })("invites", (it) => {
  it.effect("shows a group before joining it", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex);
      const invite = yield* alex.invites.create({
        params: { groupId: group.group.id },
        payload: { id: ids.invite(), maxUses: null },
      });
      expect(yield* bea.invites.preview({ params: { code: invite.code } })).toEqual({
        groupId: group.group.id,
        groupName: "Vegas crew",
        memberCount: 1,
        status: "open",
        alreadyMember: false,
      });
      const joined = yield* bea.invites.accept({
        params: { code: invite.code.toLowerCase() },
        payload: { displayName: "Bea" },
      });
      expect(joined.role).toBe("member");
      expect(joined.players.map((player) => player.displayName)).toEqual(["Owner", "Bea"]);
    }),
  );

  it.effect("brings someone who left back as the same player", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const beaId = group.players[1]!.id;
      yield* bea.groups.leave({ params: { groupId: group.group.id } });
      const invite = yield* alex.invites.create({
        params: { groupId: group.group.id },
        payload: { id: ids.invite(), maxUses: 1 },
      });
      const back = yield* bea.invites.accept({
        params: { code: invite.code },
        payload: { displayName: "New name" },
      });
      expect(back.myPlayerId).toBe(beaId);
      expect(back.players).toHaveLength(2);
    }),
  );

  it.effect("stops working once revoked, used up or a week old", () =>
    Effect.gen(function* () {
      const { alex, bea, cal, dee } = yield* users("alex", "bea", "cal", "dee");
      const group = yield* groupWith(alex);
      const groupId = group.group.id;
      const make = (maxUses: number | null) =>
        alex.invites.create({ params: { groupId }, payload: { id: ids.invite(), maxUses } });
      const accept = (client: typeof bea, code: string) =>
        Effect.flip(
          client.invites.accept({ params: { code }, payload: { displayName: "Someone" } }),
        );

      const revoked = yield* make(null);
      yield* alex.invites.revoke({ params: { inviteId: revoked.id } });
      expect(yield* accept(bea, revoked.code)).toMatchObject({ reason: "invite_revoked" });

      const single = yield* make(1);
      yield* bea.invites.accept({ params: { code: single.code }, payload: { displayName: "Bea" } });
      expect(yield* accept(cal, single.code)).toMatchObject({ reason: "invite_used_up" });

      const old = yield* make(null);
      yield* TestClock.adjust("8 days");
      expect(yield* accept(dee, old.code)).toMatchObject({ reason: "invite_expired" });
      expect(yield* alex.invites.list({ params: { groupId } })).toEqual([]);
    }),
  );
});
