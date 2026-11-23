import { request, type OutgoingHttpHeaders } from "node:http";

import { afterAll, beforeAll, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { createTestHarness } from "wrangler";
import {
  MAX_SCOPE_SOCKETS,
  ORIGIN_HEADER,
  SCOPE_PING,
  SCOPE_PONG,
  groupScope,
  tableScope,
} from "@stacks/contracts";
import { PushRecordingRequest } from "@stacks/contracts/recordingCommands";

import { clerkJwtKey, sessionToken } from "./testing/clerk.test-utils.ts";
import { groupWith, ids, users } from "./testing/fixtures.test-utils.ts";
import { rebuy, sharedTable } from "./testing/recording.test-utils.ts";
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
          main: "testing/scopeChannelWorker.test-utils.ts",
          compatibility_date: "2026-10-01",
          compatibility_flags: ["nodejs_compat"],
          hyperdrive: [
            { binding: "HYPERDRIVE", id: "local", localConnectionString: TEST_DATABASE_URL },
          ],
          durable_objects: {
            bindings: [{ name: "SCOPE_CHANNEL", class_name: "ProbedScopeChannel" }],
          },
          migrations: [{ tag: "v1", new_sqlite_classes: ["ProbedScopeChannel"] }],
        },
        vars: { CLERK_JWT_KEY: clerkJwtKey },
      },
    ],
  });

  const { url } = await harness.listen();

  return { harness, origin: url.origin };
};

let workerd: Awaited<ReturnType<typeof start>>;

beforeAll(async () => {
  workerd = await start();
});

afterAll(() => workerd.harness.close());

const upgradeStatus = (path: string, authorization: string | null) =>
  new Promise<number>((resolve, reject) => {
    const headers: OutgoingHttpHeaders = {
      connection: "Upgrade",
      upgrade: "websocket",
      "sec-websocket-version": "13",
      "sec-websocket-key": Buffer.from(crypto.randomUUID().slice(0, 16)).toString("base64"),
    };

    if (authorization) headers.authorization = authorization;
    const attempt = request(`${workerd.origin}${path}`, { headers });

    attempt.on("response", (response) => resolve(response.statusCode ?? 0));
    attempt.on("upgrade", (response, socket) => {
      socket.destroy();
      resolve(response.statusCode ?? 0);
    });
    attempt.on("error", reject);
    attempt.end();
  });

const watch = (path: string, authorization: string | null = null) =>
  new Promise<{ readonly socket: WebSocket; readonly next: () => Promise<string> }>(
    (resolve, reject) => {
      const url = `${workerd.origin.replace("http", "ws")}${path}`;

      // SAFETY: Node's WebSocket takes request headers in a second argument that the Workers type omits.
      const socket: WebSocket = authorization
        ? Reflect.construct(WebSocket, [url, { headers: { authorization } }])
        : new WebSocket(url);

      const inbox: Array<string> = [];
      const waiting: Array<(message: string) => void> = [];

      socket.addEventListener("message", (event) => {
        const next = waiting.shift();

        if (next) next(String(event.data));
        else inbox.push(String(event.data));
      });

      socket.addEventListener("error", () => reject(new Error(`could not watch ${path}`)));

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

const newScope = () => groupScope(ids.group());

const channel = (verb: string, scope: string) => `/_probe/${verb}/${scope}`;

const call = (verb: string, scope: string) =>
  fetch(`${workerd.origin}${channel(verb, scope)}`, { method: "POST" });

const Probe = Schema.Struct({ wakes: Schema.Number, handled: Schema.Number });

const probe = async (scope: string) =>
  Schema.decodeUnknownSync(Probe)(
    await (await fetch(`${workerd.origin}${channel("probe", scope)}`)).json(),
  );

const evict = (scope: string) =>
  workerd.harness
    .getWorker()
    .evictDurableObject("SCOPE_CHANNEL", { name: scope, webSockets: "hibernate" })
    .catch((error: Error) => {
      if (!error.message.includes("not currently running")) throw error;
    });

const noticeFor = (scope: string, origin: string | null = null) =>
  JSON.stringify({ scope, origin });

it.effect("keeps two scopes apart and sends a notice only to its own", () =>
  Effect.gen(function* () {
    const [one, two] = [newScope(), newScope()];

    const [first, again, other] = yield* Effect.promise(() =>
      Promise.all([
        watch(channel("ws", one)),
        watch(channel("ws", one)),
        watch(channel("ws", two)),
      ]),
    );

    yield* Effect.promise(() => call("notify", one));
    yield* Effect.promise(() => call("notify", two));

    expect(yield* Effect.promise(first.next)).toBe(noticeFor(one));
    expect(yield* Effect.promise(again.next)).toBe(noticeFor(one));
    expect(yield* Effect.promise(other.next)).toBe(noticeFor(two));

    for (const { socket } of [first, again, other]) socket.close();
  }),
);

it.effect("keeps sending when one socket can't be sent to", () =>
  Effect.gen(function* () {
    const scope = newScope();

    const [first, second] = yield* Effect.promise(() =>
      Promise.all([watch(channel("ws", scope)), watch(channel("ws", scope))]),
    );

    yield* Effect.promise(() => call("poison", scope));
    yield* Effect.promise(() => call("notify", scope));

    expect(yield* Effect.promise(first.next)).toBe(noticeFor(scope));
    expect(yield* Effect.promise(second.next)).toBe(noticeFor(scope));
    first.socket.close();
    second.socket.close();
  }),
);

it.effect("answers ping without waking the object, and delivers after it hibernated", () =>
  Effect.gen(function* () {
    const scope = newScope();
    const watcher = yield* Effect.promise(() => watch(channel("ws", scope)));

    yield* Effect.promise(() => evict(scope));
    watcher.socket.send(SCOPE_PING);
    expect(yield* Effect.promise(watcher.next)).toBe(SCOPE_PONG);
    yield* Effect.promise(() => evict(scope));

    expect(yield* Effect.promise(() => probe(scope))).toEqual({ wakes: 2, handled: 0 });
    yield* Effect.promise(() => evict(scope));
    yield* Effect.promise(() => call("notify", scope));
    expect(yield* Effect.promise(watcher.next)).toBe(noticeFor(scope));
    watcher.socket.close();
  }),
);

it.effect("refuses a socket past the cap, and a request that isn't an upgrade", () =>
  Effect.gen(function* () {
    const scope = newScope();

    const sockets = yield* Effect.promise(() =>
      Promise.all(Array.from({ length: MAX_SCOPE_SOCKETS }, () => watch(channel("ws", scope)))),
    );

    expect(yield* Effect.promise(() => upgradeStatus(channel("ws", scope), null))).toBe(503);

    expect(
      (yield* Effect.promise(() => fetch(`${workerd.origin}${channel("ws", scope)}`))).status,
    ).toBe(426);

    for (const { socket } of sockets) socket.close();
  }),
);

it.layer(TestApi.layer)("the Worker", (it) => {
  it.effect("tells a member watching their group about a trip someone else starts", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const groupId = group.group.id;
      const path = `/api/realtime/${groupScope(groupId)}`;
      const [alexId, beaId] = [group.players[0]!.userId!, group.players[1]!.userId!];

      expect(yield* Effect.promise(() => upgradeStatus(path, null))).toBe(401);
      expect(
        yield* Effect.promise(() =>
          upgradeStatus(path, `Bearer ${sessionToken("user_stranger", 300)}`),
        ),
      ).toBe(403);

      const watcher = yield* Effect.promise(() =>
        watch(path, `Bearer ${sessionToken(alexId, 300)}`),
      );

      const started = yield* Effect.promise(() =>
        fetch(`${workerd.origin}/api/groups/${groupId}/trips`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${sessionToken(beaId, 300)}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ id: ids.trip(), name: "Reno" }),
        }),
      );

      expect(started.status).toBe(200);

      expect(yield* Effect.promise(watcher.next)).toBe(noticeFor(groupScope(groupId)));
      watcher.socket.close();
    }),
  );

  it.effect("tells a share-link viewer when someone records at the table, naming who did", () =>
    Effect.gen(function* () {
      const { starter, opened, token } = yield* sharedTable();
      const scope = tableScope(opened.tableId);
      const path = `/api/realtime/${scope}`;

      expect(yield* Effect.promise(() => upgradeStatus(path, null))).toBe(401);
      expect(yield* Effect.promise(() => upgradeStatus(path, "Share nonsense"))).toBe(404);

      const watcher = yield* Effect.promise(() => watch(path, `Share ${token}`));

      const body = Schema.encodeSync(Schema.toCodecJson(PushRecordingRequest))({
        identity: starter.identity,
        commands: [rebuy(starter.identity, opened.visitId)],
      });

      const pushed = yield* Effect.promise(() =>
        fetch(`${workerd.origin}/api/recording/commands`, {
          method: "POST",
          headers: {
            authorization: `Actor ${starter.credential.actorId}.${starter.credential.secret}`,
            "content-type": "application/json",
            [ORIGIN_HEADER]: "phone-1",
          },
          body: JSON.stringify(body),
        }),
      );

      expect(pushed.status).toBe(200);
      expect(yield* Effect.promise(watcher.next)).toBe(noticeFor(scope, "phone-1"));
      watcher.socket.close();
    }),
  );
});
