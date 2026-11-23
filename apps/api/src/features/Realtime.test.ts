import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { CurrencyCode, StakeId, groupScope, type ScopeId } from "@stacks/contracts";

import { groupWith, ids, usd, users, type TestGroup } from "../testing/fixtures.test-utils.ts";
import { TestApi } from "../testing/TestApi.test-utils.ts";
import * as Realtime from "./Realtime.ts";

const stakeRequest = (group: TestGroup, lender: TestGroup["players"][number]["id"]) => ({
  params: { tripId: group.tripId },
  payload: {
    id: StakeId.make(crypto.randomUUID()),
    lenderId: lender,
    borrowerId: group.players.find((player) => player.id !== lender)!.id,
    amount: usd(100000),
    lenderShare: 50,
    note: null,
  },
});

it.layer(TestApi.layer)("realtime notices", (it) => {
  it.effect("notifies the group once a stake is created, ended, reopened or voided", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const scope = groupScope(group.group.id);
      const request = stakeRequest(group, group.myPlayerId);
      const stakeId = request.payload.id;

      expect(yield* api.notified(alex.stakes.create(request))).toEqual([scope]);
      expect(yield* api.notified(alex.stakes.end({ params: { stakeId }, payload: {} }))).toEqual([
        scope,
      ]);
      expect(yield* api.notified(alex.stakes.reopen({ params: { stakeId } }))).toEqual([scope]);

      expect(
        yield* api.notified(
          alex.stakes.void({ params: { stakeId }, payload: { reason: "entered twice" } }),
        ),
      ).toEqual([scope]);
    }),
  );

  it.effect("notifies nothing for a replayed stake or a stake voided twice", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const request = stakeRequest(group, group.myPlayerId);
      const stakeId = request.payload.id;
      yield* alex.stakes.create(request);

      expect(yield* api.notified(alex.stakes.create(request))).toEqual([]);
      yield* alex.stakes.void({ params: { stakeId }, payload: { reason: "entered twice" } });

      expect(
        yield* api.notified(
          Effect.flip(
            alex.stakes.void({ params: { stakeId }, payload: { reason: "entered twice" } }),
          ),
        ),
      ).toEqual([]);
    }),
  );

  it.effect("notifies the group of every trip change, and nothing for a replay", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const { alex } = yield* users("alex");
      const group = yield* groupWith(alex);
      const groupId = group.group.id;
      const scope = groupScope(groupId);
      const tripId = ids.trip();
      const create = { params: { groupId }, payload: { id: tripId, name: "Reno" } };

      expect(yield* api.notified(alex.trips.create(create))).toEqual([scope]);
      expect(yield* api.notified(alex.trips.create(create))).toEqual([]);

      expect(
        yield* api.notified(
          alex.trips.rename({ params: { tripId }, payload: { name: "Reno again" } }),
        ),
      ).toEqual([scope]);

      expect(
        yield* api.notified(
          alex.trips.rename({ params: { tripId }, payload: { name: "Reno again" } }),
        ),
      ).toEqual([]);
      expect(yield* api.notified(alex.trips.end({ params: { tripId }, payload: {} }))).toEqual([
        scope,
      ]);
      expect(yield* api.notified(alex.trips.reopen({ params: { tripId } }))).toEqual([scope]);
      expect(yield* api.notified(alex.trips.delete({ params: { tripId } }))).toEqual([scope]);
    }),
  );

  it.effect("notifies the group when it, its members or its roles change", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const { alex, bea, cal } = yield* users("alex", "bea", "cal");
      const group = yield* groupWith(alex, bea, cal);
      const groupId = group.group.id;
      const scope = groupScope(groupId);
      const userOf = (index: number) => group.players[index]!.userId!;
      const rename = { params: { groupId }, payload: { name: "Reno crew" } };

      expect(yield* api.notified(alex.groups.rename(rename))).toEqual([scope]);
      expect(yield* api.notified(alex.groups.rename(rename))).toEqual([]);

      const promote = {
        params: { groupId, userId: userOf(1) },
        payload: { role: "admin" },
      } as const;

      expect(yield* api.notified(alex.groups.setRole(promote))).toEqual([scope]);
      expect(yield* api.notified(alex.groups.setRole(promote))).toEqual([]);

      expect(
        yield* api.notified(alex.groups.removeMember({ params: { groupId, userId: userOf(2) } })),
      ).toEqual([scope]);
      expect(yield* api.notified(bea.groups.leave({ params: { groupId } }))).toEqual([scope]);
    }),
  );

  it.effect("notifies the group of a new guest, once, and when someone claims them", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const { alex, gus } = yield* users("alex", "gus");
      const group = yield* groupWith(alex);
      const groupId = group.group.id;
      const scope = groupScope(groupId);
      const guestId = ids.player();
      const add = { params: { groupId }, payload: { id: guestId, displayName: "Gus" } };

      expect(yield* api.notified(alex.guests.add(add))).toEqual([scope]);
      expect(yield* api.notified(alex.guests.add(add))).toEqual([]);

      const code = (yield* alex.groups.get({ params: { groupId } })).players.find(
        (player) => player.id === guestId,
      )!.claimCode!;

      expect(yield* api.notified(gus.guests.claim({ params: { code } }))).toEqual([scope]);
    }),
  );

  it.effect("notifies the group of an invite made, revoked and accepted", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex);
      const groupId = group.group.id;
      const scope = groupScope(groupId);
      const create = { params: { groupId }, payload: { id: ids.invite(), maxUses: null } };

      expect(yield* api.notified(alex.invites.create(create))).toEqual([scope]);
      expect(yield* api.notified(alex.invites.create(create))).toEqual([]);
      const invite = yield* alex.invites.create(create);

      expect(
        yield* api.notified(
          bea.invites.accept({ params: { code: invite.code }, payload: { displayName: "Bea" } }),
        ),
      ).toEqual([scope]);

      expect(
        yield* api.notified(
          bea.invites.accept({ params: { code: invite.code }, payload: { displayName: "Bea" } }),
        ),
      ).toEqual([]);
      expect(
        yield* api.notified(alex.invites.revoke({ params: { inviteId: create.payload.id } })),
      ).toEqual([scope]);

      expect(
        yield* api.notified(alex.invites.revoke({ params: { inviteId: create.payload.id } })),
      ).toEqual([]);
    }),
  );

  it.effect("notifies nobody when a group is created, since nobody can watch it yet", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const { alex } = yield* users("alex");

      expect(
        yield* api.notified(
          alex.groups.create({
            payload: {
              id: ids.group(),
              name: "Vegas crew",
              currency: CurrencyCode.make("USD"),
              displayName: "Owner",
            },
          }),
        ),
      ).toEqual([]);
    }),
  );

  it.effect("notifies nothing for a write the server refuses", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const request = stakeRequest(group, group.myPlayerId);

      expect(
        yield* api.notified(
          Effect.flip(
            alex.stakes.create({
              ...request,
              payload: { ...request.payload, borrowerId: group.myPlayerId },
            }),
          ),
        ),
      ).toEqual([]);
    }),
  );

  it.effect("keeps the write when the notice can't be sent", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const request = stakeRequest(group, group.myPlayerId);
      yield* api.refuseNotices(alex.stakes.create(request));

      expect((yield* alex.trips.get({ params: { tripId: group.tripId } })).stakes).toHaveLength(1);
    }),
  );

  it.effect("queues nothing from a transaction that rolls back", () =>
    Effect.gen(function* () {
      const realtime = Realtime.makeRealtime();
      const scope = groupScope(ids.group());

      const exit = yield* Effect.exit(
        Realtime.transaction(
          Effect.gen(function* () {
            yield* Realtime.changed(scope);

            return yield* Effect.fail("refused");
          }),
        ),
      ).pipe(Effect.provideService(Realtime.Realtime, realtime));

      expect(Exit.isFailure(exit)).toBe(true);
      expect(realtime.queued()).toEqual([]);
    }),
  );

  it.effect("sends what a request committed even when its response then fails", () =>
    Effect.gen(function* () {
      const scope = groupScope(ids.group());
      const sent: Array<ScopeId> = [];
      const pending: Array<Promise<unknown>> = [];

      const exit = yield* Effect.exit(
        Realtime.withRealtime(
          {
            notify: async (notice) => void sent.push(notice.scope),
            waitUntil: (work) => void pending.push(work),
          },
          null,
          (realtime) =>
            Realtime.transaction(Realtime.changed(scope)).pipe(
              Effect.andThen(Effect.die("view failed")),
              Effect.provideService(Realtime.Realtime, realtime),
            ),
        ),
      );

      yield* Effect.promise(() => Promise.all(pending));
      expect(Exit.isFailure(exit)).toBe(true);
      expect(sent).toEqual([scope]);
    }),
  );
});
