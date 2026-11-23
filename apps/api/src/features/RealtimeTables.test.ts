import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import {
  ActorId,
  PlayerId,
  groupScope,
  tableScope,
  type GroupId,
  type ScopeId,
} from "@stacks/contracts";
import type { RecordingCommand, RecordingIdentity } from "@stacks/contracts/recordingCommands";

import { groupWith, ids, users } from "../testing/fixtures.test-utils.ts";
import {
  account,
  deleteTable,
  deleteVisit,
  device,
  finish,
  openTable,
  rebuy,
  recorderCommand,
  seatNew,
  setTableTrip,
  sharedTable,
  sitDown,
  start,
  uuid,
} from "../testing/recording.test-utils.ts";
import { TestApi } from "../testing/TestApi.test-utils.ts";

const identity = () =>
  ({
    playerId: PlayerId.make(uuid()),
    actorId: ActorId.make(uuid()),
  }) satisfies RecordingIdentity;

type Account = Effect.Success<ReturnType<typeof users>>["alex"];

const push = (
  client: Account,
  who: RecordingIdentity,
  ...commands: ReadonlyArray<RecordingCommand>
) =>
  client.recording
    .push({ payload: { identity: who, commands: [commands[0]!, ...commands.slice(1)] } })
    .pipe(
      Effect.map(({ results }) =>
        results.map((result) => (result.status === "rejected" ? result.reason : result.status)),
      ),
    );

const newTrip = (client: Account, groupId: GroupId) =>
  client.trips
    .create({ params: { groupId }, payload: { id: ids.trip(), name: "Reno" } })
    .pipe(Effect.map((trip) => trip.id));

const heard = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const api = yield* TestApi;

    return (yield* api.notified(effect)).toSorted();
  });

const scopes = (...expected: ReadonlyArray<ScopeId>) => expected.toSorted();

it.layer(TestApi.layer)("table notices", (it) => {
  it.effect(
    "notifies the table and its group once a command commits, and nothing for a replay",
    () =>
      Effect.gen(function* () {
        const { alex } = yield* users("alex");
        const group = yield* groupWith(alex);
        const who = identity();
        const opened = start(who);
        const table = tableScope(opened.tableId);
        const inGroup = groupScope(group.group.id);
        const add = rebuy(who, opened.visitId);
        const choose = setTableTrip(who, opened.tableId, group.tripId);

        expect(yield* heard(push(alex, who, opened))).toEqual([]);
        expect(yield* heard(push(alex, who, choose))).toEqual(scopes(table, inGroup));
        expect(yield* heard(push(alex, who, add))).toEqual(scopes(table, inGroup));
        expect(yield* heard(push(alex, who, add, choose))).toEqual([]);
      }),
  );

  it.effect("notifies only the tables whose commands committed in a mixed batch", () =>
    Effect.gen(function* () {
      const { alex } = yield* users("alex");
      const who = identity();
      const first = start(who);
      const second = start(who);
      yield* push(alex, who, first, second);
      const stale = rebuy(who, first.visitId, 7);
      const fresh = rebuy(who, second.visitId);

      expect(yield* heard(push(alex, who, stale, fresh))).toEqual([tableScope(second.tableId)]);
      expect(yield* heard(push(alex, who, stale))).toEqual([]);
    }),
  );

  it.effect("names the old and the new group when a table moves, and the old when it goes", () =>
    Effect.gen(function* () {
      const { alex } = yield* users("alex");
      const reno = yield* groupWith(alex);
      const vegas = yield* groupWith(alex);
      const renoAgain = yield* newTrip(alex, reno.group.id);
      const who = identity();
      const opened = start(who);
      const table = tableScope(opened.tableId);
      const renoScope = groupScope(reno.group.id);
      const vegasScope = groupScope(vegas.group.id);
      yield* push(alex, who, opened);

      expect(yield* heard(push(alex, who, setTableTrip(who, opened.tableId, reno.tripId)))).toEqual(
        scopes(table, renoScope),
      );
      expect(yield* heard(push(alex, who, setTableTrip(who, opened.tableId, reno.tripId)))).toEqual(
        [],
      );
      expect(yield* heard(push(alex, who, setTableTrip(who, opened.tableId, renoAgain)))).toEqual(
        scopes(table, renoScope),
      );
      expect(
        yield* heard(push(alex, who, setTableTrip(who, opened.tableId, vegas.tripId))),
      ).toEqual(scopes(table, renoScope, vegasScope));
      expect(yield* heard(push(alex, who, setTableTrip(who, opened.tableId, null)))).toEqual(
        scopes(table, vegasScope),
      );

      const unplayed = openTable(who);
      yield* push(alex, who, unplayed, setTableTrip(who, unplayed.tableId, reno.tripId));

      expect(yield* heard(push(alex, who, deleteTable(who, unplayed.tableId)))).toEqual(
        scopes(tableScope(unplayed.tableId), renoScope),
      );
    }),
  );

  it.effect("notifies the table only when a recorder is appointed or revoked", () =>
    Effect.gen(function* () {
      const { starter, opened, token } = yield* sharedTable();
      const dee = yield* account("dee");
      const { player } = yield* dee.join(token, { id: PlayerId.make(uuid()), displayName: "Dee" });
      yield* dee.push(sitDown(dee.identity, opened.tableId, player.id));
      const table = tableScope(opened.tableId);

      const appoint = recorderCommand(
        "appoint_recorder",
        starter.identity,
        opened.tableId,
        player.id,
      );

      const revoke = recorderCommand(
        "revoke_recorder",
        starter.identity,
        opened.tableId,
        player.id,
      );

      expect(yield* heard(starter.push(appoint))).toEqual([table]);
      expect(yield* heard(starter.push(revoke))).toEqual([table]);
    }),
  );

  it.effect("notifies the table when someone joins, shares or stops sharing it", () =>
    Effect.gen(function* () {
      const starter = yield* device();
      const opened = openTable(starter.identity);
      yield* starter.push(opened);
      const table = tableScope(opened.tableId);
      const params = { params: { tableId: opened.tableId } };
      const bea = yield* device();

      expect(yield* heard(starter.client.recording.share(params))).toEqual([table]);
      const { token } = yield* starter.client.recording.share(params);
      expect(yield* heard(bea.join(token))).toEqual([table]);
      expect(yield* heard(bea.join(token))).toEqual([]);
      expect(yield* heard(starter.client.recording.unshare(params))).toEqual([table]);
      expect(yield* heard(starter.client.recording.unshare(params))).toEqual([]);
    }),
  );

  it.effect("tells only a device's open tables, and their groups, when it is claimed", () =>
    Effect.gen(function* () {
      const { alex } = yield* users("alex");
      const guest = yield* device();
      const live = start(guest.identity);
      const done = start(guest.identity);
      const gone = openTable(guest.identity);
      expect(yield* guest.push(live, done, gone)).toEqual(["accepted", "accepted", "accepted"]);
      expect(yield* guest.push(finish(guest.identity, done.visitId))).toEqual(["accepted"]);
      expect(yield* guest.push(deleteTable(guest.identity, gone.tableId))).toEqual(["accepted"]);

      expect(yield* heard(alex.claim.claimActor({ payload: guest.credential }))).toEqual([
        tableScope(live.tableId),
      ]);
      expect(yield* heard(alex.claim.claimActor({ payload: guest.credential }))).toEqual([]);
    }),
  );

  it.effect(
    "tells a claimed device's tables once when it is linked, not again for the same link",
    () =>
      Effect.gen(function* () {
        const { alex } = yield* users("alex");
        const own = identity();
        yield* push(alex, own, start(own));
        const guest = yield* device();
        const live = start(guest.identity);
        yield* guest.push(live);
        const link = { payload: { ...guest.credential, link: true } };

        expect(yield* heard(alex.claim.claimActor(link))).toEqual([tableScope(live.tableId)]);
        expect(yield* heard(alex.claim.claimActor(link))).toEqual([]);
      }),
  );

  it.effect("doesn't count a deleted visit as a reason to tell a table", () =>
    Effect.gen(function* () {
      const { starter, opened } = yield* sharedTable();
      const seated = seatNew(starter.identity, opened.tableId, "Bea");
      yield* starter.push(seated);
      const params = { params: { playerId: seated.playerId } };
      const first = yield* starter.client.recording.invitePlayer(params);
      const phone = yield* device();
      yield* phone.redeem(first.token);

      expect(yield* phone.push(deleteVisit(phone.identity, seated.visitId))).toEqual(["accepted"]);

      const second = yield* starter.client.recording.invitePlayer(params);
      const laptop = yield* device();

      expect(yield* heard(laptop.redeem(second.token))).toEqual([]);
    }),
  );

  it.effect(
    "tells the player's open tables when an invite is redeemed or a device is stopped",
    () =>
      Effect.gen(function* () {
        const { starter, opened } = yield* sharedTable();
        const seated = seatNew(starter.identity, opened.tableId, "Bea");
        yield* starter.push(seated);
        const table = tableScope(opened.tableId);
        const params = { params: { playerId: seated.playerId } };
        const invite = yield* starter.client.recording.invitePlayer(params);
        const bea = yield* device();

        expect(yield* heard(starter.client.recording.invitePlayer(params))).toEqual([]);
        const current = yield* starter.client.recording.invitePlayer(params);
        expect(yield* heard(bea.redeem(current.token))).toEqual([table]);
        expect(invite.token).not.toBe(current.token);

        expect(
          yield* heard(
            starter.client.recording.revokeBinding({
              params: { playerId: seated.playerId, actorId: bea.identity.actorId },
            }),
          ),
        ).toEqual([table]);
      }),
  );

  it.effect("carries the writer's X-Origin, and none when the request sent none", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const starter = yield* device();
      const opened = start(starter.identity);
      yield* starter.push(opened);
      const named = yield* api.asActor(starter.credential, "install-1");
      const add = rebuy(starter.identity, opened.visitId);

      const notices = yield* api.noticed(
        named.recording.push({ payload: { identity: starter.identity, commands: [add] } }),
      );

      expect(notices).toEqual([{ scope: tableScope(opened.tableId), origin: "install-1" }]);

      const anonymous = yield* api.noticed(
        starter.push(rebuy(starter.identity, opened.visitId, 1)),
      );

      expect(anonymous).toEqual([{ scope: tableScope(opened.tableId), origin: null }]);
    }),
  );

  it.effect("ignores an X-Origin that isn't a short plain id", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const starter = yield* device();
      const opened = start(starter.identity);
      yield* starter.push(opened);
      const named = yield* api.asActor(starter.credential, "x".repeat(200));
      const add = rebuy(starter.identity, opened.visitId);

      const notices = yield* api.noticed(
        named.recording.push({ payload: { identity: starter.identity, commands: [add] } }),
      );

      expect(notices.map((notice) => notice.origin)).toEqual([null]);
    }),
  );
});
