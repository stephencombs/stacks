import { request, type OutgoingHttpHeaders } from "node:http";

import { afterAll, beforeAll, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { createTestHarness } from "wrangler";
import { groupScope } from "@stacks/contracts";

import { clerkJwtKey, sessionToken } from "./testing/clerk.test-utils.ts";
import { groupWith, ids, users } from "./testing/fixtures.test-utils.ts";
import { TestApi } from "./testing/TestApi.test-utils.ts";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/stacks_test";

const start = async () => {
  const harness = createTestHarness({
    root: import.meta.dirname,
    workers: [
      {
        config: {
          name: "worker-smoke",
          main: "worker.ts",
          compatibility_date: "2026-10-01",
          compatibility_flags: ["nodejs_compat"],
          hyperdrive: [
            { binding: "HYPERDRIVE", id: "local", localConnectionString: TEST_DATABASE_URL },
          ],
          durable_objects: { bindings: [{ name: "SCOPE_CHANNEL", class_name: "ScopeChannel" }] },
          migrations: [{ tag: "v1", new_sqlite_classes: ["ScopeChannel"] }],
        },
        vars: { CLERK_JWT_KEY: clerkJwtKey },
      },
    ],
  });

  const { url } = await harness.listen();

  return { harness, origin: url.origin };
};

let worker: Awaited<ReturnType<typeof start>>;

beforeAll(async () => {
  worker = await start();
});

afterAll(() => worker.harness.close());

const upgradeStatus = (path: string, token: string | null) =>
  new Promise<number>((resolve, reject) => {
    const headers: OutgoingHttpHeaders = {
      connection: "Upgrade",
      upgrade: "websocket",
      "sec-websocket-version": "13",
      "sec-websocket-key": Buffer.from(crypto.randomUUID().slice(0, 16)).toString("base64"),
    };

    if (token) headers.authorization = `Bearer ${token}`;
    const attempt = request(`${worker.origin}${path}`, { headers });

    attempt.on("response", (response) => resolve(response.statusCode ?? 0));
    attempt.on("upgrade", (response, socket) => {
      socket.destroy();
      resolve(response.statusCode ?? 0);
    });
    attempt.on("error", reject);
    attempt.end();
  });

const watch = (path: string, token: string) =>
  new Promise<{ readonly socket: WebSocket; readonly next: () => Promise<string> }>(
    (resolve, reject) => {
      // SAFETY: Node's WebSocket takes request headers in a second argument that the Workers type omits.
      const socket: WebSocket = Reflect.construct(WebSocket, [
        `${worker.origin.replace("http", "ws")}${path}`,
        { headers: { authorization: `Bearer ${token}` } },
      ]);

      const inbox: Array<string> = [];
      const waiting: Array<(message: string) => void> = [];

      socket.addEventListener("message", (event) => {
        const next = waiting.shift();

        if (next) next(String(event.data));
        else inbox.push(String(event.data));
      });

      socket.addEventListener("error", () => reject(new Error("could not watch the group")));

      socket.addEventListener("open", () =>
        resolve({
          socket,
          next: () =>
            inbox.length > 0
              ? Promise.resolve(inbox.shift()!)
              : new Promise((received) => waiting.push(received)),
        }),
      );
    },
  );

it.layer(TestApi.layer)("worker under workerd", (it) => {
  it.effect("tells a member watching their group about a trip someone else starts", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const groupId = group.group.id;
      const path = `/api/realtime/${groupScope(groupId)}`;
      const [alexId, beaId] = [group.players[0]!.userId!, group.players[1]!.userId!];

      expect(yield* Effect.promise(() => upgradeStatus(path, null))).toBe(401);
      expect(
        yield* Effect.promise(() => upgradeStatus(path, sessionToken("user_stranger", 300))),
      ).toBe(403);

      const watcher = yield* Effect.promise(() => watch(path, sessionToken(alexId, 300)));

      const started = yield* Effect.promise(() =>
        fetch(`${worker.origin}/api/groups/${groupId}/trips`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${sessionToken(beaId, 300)}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ id: ids.trip(), name: "Reno" }),
        }),
      );

      expect(started.status).toBe(200);

      expect(yield* Effect.promise(watcher.next)).toBe(
        JSON.stringify({ scope: groupScope(groupId), origin: null }),
      );
      watcher.socket.close();
    }),
  );
});
