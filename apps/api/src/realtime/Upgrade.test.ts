import { expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import { ActorId, PlayerId, groupScope, tableScope } from "@stacks/contracts";

import * as Clerk from "../auth/Clerk.ts";
import { clerkJwtKey, sessionToken } from "../testing/clerk.test-utils.ts";
import * as Recording from "../features/Recording.ts";
import { groupWith, ids, users } from "../testing/fixtures.test-utils.ts";
import {
  account,
  deleteTable,
  deleteVisit,
  device,
  openTable,
  seatNew,
  setTableTrip,
  sharedTable,
  signedIn,
  start,
  uuid,
} from "../testing/recording.test-utils.ts";
import { TestApi } from "../testing/TestApi.test-utils.ts";

const clerkVerify = Clerk.makeVerify.pipe(
  Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ CLERK_JWT_KEY: clerkJwtKey }))),
);

it.layer(TestApi.layer)("realtime upgrade", (it) => {
  it.effect("hands a member's upgrade to their group's channel", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const { alex } = yield* users("alex");
      const group = yield* groupWith(alex);
      const scope = groupScope(group.group.id);
      const response = yield* api.upgrade(scope, { token: group.players[0]!.userId });

      expect(response.status).toBe(200);
      expect(api.forwarded).toContain(scope);
    }),
  );

  it.effect("sends an uppercase scope to the same channel as its lowercase form", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const { alex } = yield* users("alex");
      const group = yield* groupWith(alex);
      const scope = groupScope(group.group.id);

      const response = yield* api.upgrade(`group:${group.group.id.toUpperCase()}`, {
        token: group.players[0]!.userId,
      });

      expect(response.status).toBe(200);
      expect(api.forwarded.at(-1)).toBe(scope);
    }),
  );

  it.effect("refuses anything but GET with 405", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const scope = groupScope(ids.group());

      for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
        const response = yield* api.upgrade(scope, { token: "user_anyone", method });
        expect(response.status).toBe(405);
      }
    }),
  );

  it.effect("answers 426 to a request that isn't an upgrade", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;

      const response = yield* api.upgrade(groupScope(ids.group()), {
        token: "user_anyone",
        websocket: false,
      });

      expect(response.status).toBe(426);
    }),
  );

  it.effect("refuses a scope that isn't a group or a table, however well formed", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const id = ids.group();

      for (const path of ["", "nonsense", `group:${id}x`, `room:${id}`, `table:${id}x`, `group:`]) {
        const response = yield* api.upgrade(path, { token: "user_anyone" });
        expect(response.status).toBe(400);
      }
    }),
  );

  it.effect("answers 401 without a token", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const response = yield* api.upgrade(groupScope(ids.group()), {});

      expect(response.status).toBe(401);
    }),
  );

  it.effect("answers 401 to an expired session token, and lets a live one in", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const verify = yield* clerkVerify;
      const { alex } = yield* users("alex");
      const group = yield* groupWith(alex);
      const scope = groupScope(group.group.id);
      const member = group.players[0]!.userId!;

      expect(
        (yield* api.upgrade(scope, { token: sessionToken(member, -300) }, verify)).status,
      ).toBe(401);
      expect((yield* api.upgrade(scope, { token: "not a jwt" }, verify)).status).toBe(401);
      expect((yield* api.upgrade(scope, { token: sessionToken(member, 300) }, verify)).status).toBe(
        200,
      );
    }),
  );

  it.effect("refuses someone outside the group, and someone who left it", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const groupId = group.group.id;
      const scope = groupScope(groupId);
      const beaId = group.players[1]!.userId!;

      expect((yield* api.upgrade(scope, { token: beaId })).status).toBe(200);
      expect((yield* api.upgrade(scope, { token: `user_stranger_${ids.group()}` })).status).toBe(
        403,
      );
      yield* bea.groups.leave({ params: { groupId } });
      expect((yield* api.upgrade(scope, { token: beaId })).status).toBe(403);
    }),
  );

  it.effect("answers 404 for a group that doesn't exist", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const response = yield* api.upgrade(groupScope(ids.group()), { token: "user_anyone" });

      expect(response.status).toBe(404);
    }),
  );
});

const handle = (name: string) => `${name}_${uuid().slice(0, 8)}`;

const tableOf = Effect.fn("test.tableOf")(function* () {
  const name = handle("alex");
  const alex = yield* signedIn(name);
  const opened = start(alex.identity);
  expect(yield* alex.push(opened)).toEqual(["accepted"]);
  const scope = tableScope(opened.tableId);
  const { token } = yield* alex.client.recording.share({ params: { tableId: opened.tableId } });

  return { alex, opened, scope, token, bearer: `Bearer user_${name}` };
});

it.layer(TestApi.layer)("realtime upgrade of a table", (it) => {
  it.effect("lets in whoever may read the table: an account, its device actor, a share link", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const { opened, scope, token, bearer } = yield* tableOf();

      expect((yield* api.upgrade(scope, { authorization: bearer })).status).toBe(200);
      expect((yield* api.upgrade(scope, { authorization: `Share ${token}` })).status).toBe(200);
      expect(api.forwarded.at(-1)).toBe(scope);
      expect(scope).toBe(tableScope(opened.tableId));

      const starter = yield* device();
      const own = start(starter.identity);
      yield* starter.push(own);
      const actor = `Actor ${starter.credential.actorId}.${starter.credential.secret}`;

      expect((yield* api.upgrade(tableScope(own.tableId), { authorization: actor })).status).toBe(
        200,
      );
    }),
  );

  it.effect("sends an uppercase table scope to the same channel as its lowercase form", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const { opened, scope, bearer } = yield* tableOf();

      const response = yield* api.upgrade(`table:${opened.tableId.toUpperCase()}`, {
        authorization: bearer,
      });

      expect(response.status).toBe(200);
      expect(api.forwarded.at(-1)).toBe(scope);
    }),
  );

  it.effect("refuses a share link for another table, and a link that doesn't exist", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const { scope } = yield* tableOf();
      const other = yield* tableOf();

      expect((yield* api.upgrade(scope, { authorization: `Share ${other.token}` })).status).toBe(
        404,
      );
      expect((yield* api.upgrade(scope, { authorization: "Share nonsense" })).status).toBe(404);
    }),
  );

  it.effect("refuses an unknown actor, a wrong secret, and a stranger", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const { scope, bearer } = yield* tableOf();
      const stranger = yield* device();
      const known = `${stranger.credential.actorId}.${stranger.credential.secret}`;

      expect(
        (yield* api.upgrade(scope, { authorization: `Actor ${uuid()}.${"0".repeat(64)}` })).status,
      ).toBe(401);
      expect(
        (yield* api.upgrade(scope, {
          authorization: `Actor ${stranger.credential.actorId}.${"0".repeat(64)}`,
        })).status,
      ).toBe(401);
      expect((yield* api.upgrade(scope, { authorization: "Actor nodot" })).status).toBe(401);
      expect((yield* api.upgrade(scope, { authorization: `Actor ${known}` })).status).toBe(404);
      expect(
        (yield* api.upgrade(scope, { authorization: `Bearer user_${handle("stranger")}` })).status,
      ).toBe(404);
      expect((yield* api.upgrade(scope, { authorization: bearer })).status).toBe(200);
    }),
  );

  it.effect("answers 404 for a table that was deleted, or whose visits all were", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const kept = yield* tableOf();
      const { alex, opened, scope, token, bearer } = kept;
      const unplayed = openTable(alex.identity);
      yield* alex.push(unplayed);
      const params = { params: { tableId: unplayed.tableId } };
      const link = yield* alex.client.recording.share(params);
      const emptied = { authorization: bearer };
      const sharing = { authorization: `Share ${link.token}` };
      const unplayedScope = tableScope(unplayed.tableId);

      expect((yield* api.upgrade(unplayedScope, emptied)).status).toBe(200);
      expect(yield* alex.push(deleteTable(alex.identity, unplayed.tableId))).toEqual(["accepted"]);
      expect((yield* api.upgrade(unplayedScope, emptied)).status).toBe(404);
      expect((yield* api.upgrade(unplayedScope, sharing)).status).toBe(404);

      expect((yield* api.upgrade(scope, { authorization: `Share ${token}` })).status).toBe(200);
      expect(yield* alex.push(deleteVisit(alex.identity, opened.visitId))).toEqual(["accepted"]);
      expect((yield* api.upgrade(scope, emptied)).status).toBe(404);
      expect((yield* api.upgrade(scope, { authorization: `Share ${token}` })).status).toBe(404);
    }),
  );

  it.effect("takes group scopes only from a signed-in account", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const scope = groupScope(ids.group());

      expect((yield* api.upgrade(scope, { authorization: "Share token" })).status).toBe(401);
      expect((yield* api.upgrade(scope, { authorization: "Actor id.secret" })).status).toBe(401);
    }),
  );

  it.effect("answers 401 for a table scope without credentials", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const { scope } = yield* tableOf();

      expect((yield* api.upgrade(scope, {})).status).toBe(401);
      expect((yield* api.upgrade(scope, { authorization: "Basic abc" })).status).toBe(401);
    }),
  );
});

it.layer(TestApi.layer)("realtime upgrade tags", (it) => {
  it.effect("tags a group socket with the member", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const { alex } = yield* users("alex");
      const group = yield* groupWith(alex);
      const member = group.players[0]!.userId!;

      yield* api.upgrade(groupScope(group.group.id), { token: member });

      expect(api.forwardedTags.at(-1)).toEqual([`user:${member}`]);
    }),
  );

  it.effect("tags a table socket with what it was let in through, and no credential", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const { alex, scope, token, bearer } = yield* tableOf();
      const actorId = alex.identity.actorId.toLowerCase();

      yield* api.upgrade(scope, { authorization: bearer });
      expect(api.forwardedTags.at(-1)).toEqual([`user:${bearer.slice(7)}`, `actor:${actorId}`]);

      yield* api.upgrade(scope, { authorization: `Share ${token}` });
      expect(api.forwardedTags.at(-1)).toEqual([`share:${yield* Recording.digest(token)}`]);

      const starter = yield* device();
      const own = start(starter.identity);
      yield* starter.push(own);
      const actor = `Actor ${starter.credential.actorId}.${starter.credential.secret}`;

      yield* api.upgrade(tableScope(own.tableId), { authorization: actor });
      expect(api.forwardedTags.at(-1)).toEqual([`actor:${starter.identity.actorId.toLowerCase()}`]);

      const sent = JSON.stringify(api.forwardedTags);
      expect(sent).not.toContain(token);
      expect(sent).not.toContain(starter.credential.secret);
    }),
  );

  it.effect("tags a group member who only looks at a trip's table with that group", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const groupId = group.group.id.toLowerCase();
      const [alexId, beaId] = [group.players[0]!.userId!, group.players[1]!.userId!];
      const who = { playerId: PlayerId.make(uuid()), actorId: ActorId.make(uuid()) };
      const opened = start(who);

      yield* alex.recording.push({
        payload: {
          identity: who,
          commands: [opened, setTableTrip(who, opened.tableId, group.tripId)],
        },
      });

      const scope = tableScope(opened.tableId);

      yield* api.upgrade(scope, { token: beaId });
      expect(api.forwardedTags.at(-1)).toEqual([
        `user:${beaId}`,
        `group:${groupId}`,
        `member:${groupId}:${beaId}`,
      ]);

      yield* api.upgrade(scope, { token: alexId });
      expect(api.forwardedTags.at(-1)).toEqual([
        `user:${alexId}`,
        `actor:${who.actorId.toLowerCase()}`,
      ]);
    }),
  );

  it.effect("refuses a share link once it was replaced or removed", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const { alex, opened, scope, token } = yield* tableOf();
      const params = { params: { tableId: opened.tableId } };

      expect((yield* api.upgrade(scope, { authorization: `Share ${token}` })).status).toBe(200);
      const next = yield* alex.client.recording.share(params);
      expect((yield* api.upgrade(scope, { authorization: `Share ${token}` })).status).toBe(404);
      expect((yield* api.upgrade(scope, { authorization: `Share ${next.token}` })).status).toBe(
        200,
      );

      yield* alex.client.recording.unshare(params);
      expect((yield* api.upgrade(scope, { authorization: `Share ${next.token}` })).status).toBe(
        404,
      );
    }),
  );

  it.effect("refuses a device, and an account, whose binding to the player was revoked", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const { starter, opened } = yield* sharedTable();
      const seated = seatNew(starter.identity, opened.tableId, "Bea");
      yield* starter.push(seated);
      const scope = tableScope(opened.tableId);
      const params = { params: { playerId: seated.playerId } };

      const phone = yield* device();
      yield* phone.redeem((yield* starter.client.recording.invitePlayer(params)).token);
      const dee = yield* account("dee");
      yield* dee.redeem((yield* phone.client.recording.invitePlayer(params)).token);

      const asPhone = {
        authorization: `Actor ${phone.credential.actorId}.${phone.credential.secret}`,
      };

      const asDee = { authorization: `Bearer user_${dee.handle}` };

      expect((yield* api.upgrade(scope, asPhone)).status).toBe(200);
      expect((yield* api.upgrade(scope, asDee)).status).toBe(200);
      expect(api.forwardedTags.at(-1)).toContain(`actor:${dee.identity.actorId.toLowerCase()}`);

      yield* starter.client.recording.revokeBinding({
        params: { playerId: seated.playerId, actorId: phone.identity.actorId },
      });

      expect((yield* api.upgrade(scope, asPhone)).status).toBe(404);
      expect((yield* api.upgrade(scope, asDee)).status).toBe(404);
    }),
  );
});
