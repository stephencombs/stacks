import { expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import { groupScope } from "@stacks/contracts";

import * as Clerk from "../auth/Clerk.ts";
import { clerkJwtKey, sessionToken } from "../testing/clerk.test-utils.ts";
import { groupWith, ids, users } from "../testing/fixtures.test-utils.ts";
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

  it.effect("refuses a scope that isn't a group's, however well formed", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const id = ids.group();

      for (const path of ["", "nonsense", `group:${id}x`, `room:${id}`, `table:${id}`, `group:`]) {
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
