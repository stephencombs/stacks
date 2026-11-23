import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import {
  ActorId,
  PlayerId,
  ScopeCloseCode,
  groupScope,
  tableScope,
  type GroupId,
  type ScopeId,
} from "@stacks/contracts";
import type { RecordingCommand, RecordingIdentity } from "@stacks/contracts/recordingCommands";

import type { Selector } from "../realtime/Selector.ts";
import { groupWith, ids, users } from "../testing/fixtures.test-utils.ts";
import {
  account,
  deleteTable,
  device,
  finish,
  openTable,
  seatNew,
  setTableTrip,
  sharedTable,
  start,
  uuid,
} from "../testing/recording.test-utils.ts";
import { TestApi } from "../testing/TestApi.test-utils.ts";
import { digest } from "./Recording.ts";

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

const revoked = (scope: ScopeId, selector: Selector) =>
  ({ scope, selector, code: ScopeCloseCode.revoked }) as const;

const shut = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const api = yield* TestApi;

    return yield* api.closes(effect);
  });

const exactly = (
  actual: ReadonlyArray<unknown>,
  expected: ReadonlyArray<ReturnType<typeof revoked>>,
) => {
  expect(actual).toHaveLength(expected.length);
  expect(actual).toEqual(expect.arrayContaining([...expected]));
};

it.layer(TestApi.layer)("closing sockets that lost access", (it) => {
  it.effect("closes the old link's sockets when a share link is replaced or removed", () =>
    Effect.gen(function* () {
      const { starter, opened, token } = yield* sharedTable();
      const table = tableScope(opened.tableId);
      const params = { params: { tableId: opened.tableId } };
      const first = yield* digest(token);

      const never = openTable(starter.identity);
      yield* starter.push(never);

      expect(
        yield* shut(starter.client.recording.share({ params: { tableId: never.tableId } })),
      ).toEqual([]);

      const rotated = yield* shut(starter.client.recording.share(params));
      exactly(rotated, [revoked(table, { kind: "share", shareHash: first })]);

      const second = yield* starter.client.recording.share(params);
      const removed = yield* shut(starter.client.recording.unshare(params));
      exactly(removed, [revoked(table, { kind: "share", shareHash: yield* digest(second.token) })]);

      expect(yield* shut(starter.client.recording.unshare(params))).toEqual([]);
    }),
  );

  it.effect("closes every socket of a table that was deleted, with its own code", () =>
    Effect.gen(function* () {
      const starter = yield* device();
      const opened = openTable(starter.identity);
      yield* starter.push(opened);
      const table = tableScope(opened.tableId);
      const gone = deleteTable(starter.identity, opened.tableId);

      expect(yield* shut(starter.push(gone))).toEqual([
        { scope: table, selector: { kind: "all" }, code: ScopeCloseCode.tableDeleted },
      ]);
      expect(yield* shut(starter.push(gone))).toEqual([]);
    }),
  );

  it.effect("closes the old group's sockets when a table leaves it, and none within a group", () =>
    Effect.gen(function* () {
      const { alex } = yield* users("alex");
      const reno = yield* groupWith(alex);
      const vegas = yield* groupWith(alex);
      const renoAgain = yield* newTrip(alex, reno.group.id);
      const who = identity();
      const opened = start(who);
      const table = tableScope(opened.tableId);
      yield* push(alex, who, opened);

      const through = (groupId: GroupId) =>
        revoked(table, { kind: "group", groupId: groupId.toLowerCase() });

      const move = (tripId: typeof renoAgain | null) =>
        shut(push(alex, who, setTableTrip(who, opened.tableId, tripId)));

      expect(yield* move(reno.tripId)).toEqual([]);
      expect(yield* move(reno.tripId)).toEqual([]);
      expect(yield* move(renoAgain)).toEqual([]);
      exactly(yield* move(vegas.tripId), [through(reno.group.id)]);
      exactly(yield* move(null), [through(vegas.group.id)]);
      expect(yield* move(reno.tripId)).toEqual([]);
    }),
  );

  it.effect("closes a member's group sockets and their trip-board sockets when they go", () =>
    Effect.gen(function* () {
      const { alex, bea, cal } = yield* users("alex", "bea", "cal");
      const group = yield* groupWith(alex, bea, cal);
      const groupId = group.group.id;
      const [beaId, calId] = [group.players[1]!.userId!, group.players[2]!.userId!];
      const who = identity();
      const live = start(who);
      const done = start(who);
      const gone = openTable(who);

      yield* push(
        alex,
        who,
        live,
        done,
        gone,
        setTableTrip(who, live.tableId, group.tripId),
        setTableTrip(who, done.tableId, group.tripId),
        setTableTrip(who, gone.tableId, group.tripId),
      );
      yield* push(alex, who, finish(who, done.visitId), deleteTable(who, gone.tableId));

      const elsewhere = yield* groupWith(alex, bea);
      const other = start(who);
      yield* push(alex, who, other, setTableTrip(who, other.tableId, elsewhere.tripId));

      const leaving = (userId: string) => [
        revoked(groupScope(groupId), { kind: "user", userId }),
        revoked(tableScope(live.tableId), {
          kind: "member",
          groupId: groupId.toLowerCase(),
          userId,
        }),
      ];

      exactly(yield* shut(bea.groups.leave({ params: { groupId } })), leaving(beaId));
      expect(yield* shut(bea.groups.leave({ params: { groupId } }).pipe(Effect.flip))).toEqual([]);

      exactly(
        yield* shut(alex.groups.removeMember({ params: { groupId, userId: calId } })),
        leaving(calId),
      );
      expect(
        yield* shut(
          alex.groups.removeMember({ params: { groupId, userId: calId } }).pipe(Effect.flip),
        ),
      ).toEqual([]);
    }),
  );

  it.effect("closes every device in a revoked chain on the player's open tables only", () =>
    Effect.gen(function* () {
      const { starter, opened } = yield* sharedTable();
      const seated = seatNew(starter.identity, opened.tableId, "Bea");
      const finished = start(starter.identity);
      yield* starter.push(seated, finished);
      yield* starter.push(finish(starter.identity, finished.visitId));
      const table = tableScope(opened.tableId);
      const params = { params: { playerId: seated.playerId } };

      const phone = yield* device();
      yield* phone.redeem((yield* starter.client.recording.invitePlayer(params)).token);

      const dee = yield* account("dee");
      yield* dee.redeem((yield* phone.client.recording.invitePlayer(params)).token);

      const cal = yield* device();
      yield* cal.redeem((yield* starter.client.recording.invitePlayer(params)).token);

      const stopped = yield* shut(
        starter.client.recording.revokeBinding({
          params: { playerId: seated.playerId, actorId: phone.identity.actorId },
        }),
      );

      exactly(stopped, [
        revoked(table, { kind: "actor", actorId: phone.identity.actorId }),
        revoked(table, { kind: "actor", actorId: dee.identity.actorId }),
      ]);

      expect(
        yield* shut(
          starter.client.recording
            .revokeBinding({
              params: { playerId: seated.playerId, actorId: phone.identity.actorId },
            })
            .pipe(Effect.flip),
        ),
      ).toEqual([]);

      exactly(
        yield* shut(
          cal.client.recording.revokeBinding({
            params: { playerId: seated.playerId, actorId: cal.identity.actorId },
          }),
        ),
        [revoked(table, { kind: "actor", actorId: cal.identity.actorId })],
      );
    }),
  );
});
