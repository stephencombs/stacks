import { request } from "node:http";

import { afterAll, beforeAll, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { createTestHarness } from "wrangler";
import { MAX_SCOPE_SOCKETS, SCOPE_PING, SCOPE_PONG, groupScope } from "@stacks/contracts";

import { ids } from "../testing/fixtures.test-utils.ts";

const start = async () => {
  const harness = createTestHarness({
    root: import.meta.dirname,
    workers: [
      {
        config: {
          name: "scope-channel-smoke",
          main: "../testing/scopeChannelWorker.test-utils.ts",
          compatibility_date: "2026-10-01",
          compatibility_flags: ["nodejs_compat"],
          durable_objects: {
            bindings: [{ name: "SCOPE_CHANNEL", class_name: "ProbedScopeChannel" }],
          },
          migrations: [{ tag: "v1", new_sqlite_classes: ["ProbedScopeChannel"] }],
        },
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

const newScope = () => groupScope(ids.group());

const watch = (scope: string) =>
  new Promise<{
    readonly socket: WebSocket;
    readonly next: () => Promise<string>;
  }>((resolve, reject) => {
    const socket = new WebSocket(`${workerd.origin.replace("http", "ws")}/ws/${scope}`);
    const inbox: Array<string> = [];
    const waiting: Array<(message: string) => void> = [];

    socket.addEventListener("message", (event) => {
      const message = String(event.data);
      const next = waiting.shift();

      if (next) next(message);
      else inbox.push(message);
    });

    socket.addEventListener("error", () => reject(new Error(`could not watch ${scope}`)));

    socket.addEventListener("open", () =>
      resolve({
        socket,
        next: () =>
          inbox.length > 0
            ? Promise.resolve(inbox.shift()!)
            : new Promise((received) => waiting.push(received)),
      }),
    );
  });

const upgradeStatus = (scope: string) =>
  new Promise<number>((resolve, reject) => {
    const attempt = request(`${workerd.origin}/ws/${scope}`, {
      headers: {
        connection: "Upgrade",
        upgrade: "websocket",
        "sec-websocket-version": "13",
        "sec-websocket-key": Buffer.from(crypto.randomUUID().slice(0, 16)).toString("base64"),
      },
    });

    attempt.on("response", (response) => resolve(response.statusCode ?? 0));
    attempt.on("upgrade", (response, socket) => {
      socket.destroy();
      resolve(response.statusCode ?? 0);
    });
    attempt.on("error", reject);
    attempt.end();
  });

const call = (verb: string, scope: string) =>
  fetch(`${workerd.origin}/${verb}/${scope}`, { method: "POST" });

const Probe = Schema.Struct({ wakes: Schema.Number, handled: Schema.Number });

const probe = async (scope: string) =>
  Schema.decodeUnknownSync(Probe)(await (await fetch(`${workerd.origin}/probe/${scope}`)).json());

const evict = (scope: string) =>
  workerd.harness
    .getWorker()
    .evictDurableObject("SCOPE_CHANNEL", { name: scope, webSockets: "hibernate" })
    .catch((error: Error) => {
      if (!error.message.includes("not currently running")) throw error;
    });

const noticeFor = (scope: string) => JSON.stringify({ scope, origin: null });

it.effect("keeps two scopes apart and sends a notice only to its own", () =>
  Effect.gen(function* () {
    const [one, two] = [newScope(), newScope()];

    const [first, again, other] = yield* Effect.promise(() =>
      Promise.all([watch(one), watch(one), watch(two)]),
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
    const [first, second] = yield* Effect.promise(() => Promise.all([watch(scope), watch(scope)]));

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
    const watcher = yield* Effect.promise(() => watch(scope));

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
      Promise.all(Array.from({ length: MAX_SCOPE_SOCKETS }, () => watch(scope))),
    );

    expect(yield* Effect.promise(() => upgradeStatus(scope))).toBe(503);
    expect((yield* Effect.promise(() => fetch(`${workerd.origin}/ws/${scope}`))).status).toBe(426);

    for (const { socket } of sockets) socket.close();
  }),
);
