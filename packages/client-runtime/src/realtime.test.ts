import { describe, expect, it } from "@effect/vitest";
import { SCOPE_PING, SCOPE_PONG, groupScope, GroupId } from "@stacks/contracts";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as TestClock from "effect/testing/TestClock";

import {
  makeScopeHub,
  type AppStateName,
  type RealtimeSocket,
  type SocketHandlers,
  type ScopeListener,
} from "./realtime.ts";

const scope = groupScope(GroupId.make("0192e7a0-0000-7000-8000-000000000001"));
const notice = JSON.stringify({ scope, origin: null });

class Line implements RealtimeSocket {
  readonly sent: Array<string> = [];
  closed = false;
  readonly url: string;
  readonly authorization: string;
  readonly handlers: SocketHandlers;

  constructor(url: string, authorization: string, handlers: SocketHandlers) {
    this.url = url;
    this.authorization = authorization;
    this.handlers = handlers;
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
  }
}

const setup = (options: { token?: string | null; watchable?: boolean } = {}) =>
  Effect.gen(function* () {
    const lines = yield* Queue.unbounded<Line>();
    let tokens = 0;
    let state: AppStateName = "active";
    const changes = new Set<(state: AppStateName) => void>();

    const fork = Effect.runForkWith(yield* Effect.context<never>());

    const hub = makeScopeHub(
      {
        baseUrl: "https://api.example.com",
        getToken: async () => (options.token === null ? null : `token-${++tokens}`),
        openSocket: (url, headers, handlers) => {
          const line = new Line(url, headers.authorization, handlers);
          Queue.offerUnsafe(lines, line);

          return line;
        },
        appState: {
          current: () => state,
          subscribe: (listener) => {
            changes.add(listener);

            return () => void changes.delete(listener);
          },
        },
        watchable: () => Effect.succeed(options.watchable ?? true),
      },
      fork,
    );

    const heard = { notices: 0, connections: 0 };

    const listener: ScopeListener = {
      notice: () => void (heard.notices += 1),
      connected: () => void (heard.connections += 1),
    };

    const appState = (next: AppStateName) => {
      state = next;

      for (const change of changes) change(next);
    };

    return { hub, lines, heard, listener, appState };
  });

describe("scope hub", () => {
  it.effect("opens with the user's token, tells listeners of notices, and ignores other text", () =>
    Effect.gen(function* () {
      const { hub, lines, heard, listener } = yield* setup();
      hub.watch(scope, listener);
      const line = yield* Queue.take(lines);
      expect(line.url).toBe(`wss://api.example.com/api/realtime/${scope}`);
      expect(line.authorization).toBe("Bearer token-1");

      line.handlers.open();

      yield* Effect.yieldNow;
      line.handlers.message(notice);
      yield* Effect.yieldNow;
      line.handlers.message("not json");
      yield* Effect.yieldNow;
      line.handlers.message(SCOPE_PONG);
      yield* Effect.yieldNow;
      expect(heard).toEqual({ notices: 1, connections: 1 });
    }),
  );

  it.effect("pings every 30 seconds and keeps the socket while pongs come back", () =>
    Effect.gen(function* () {
      const { hub, lines, listener } = yield* setup();
      hub.watch(scope, listener);
      const line = yield* Queue.take(lines);
      line.handlers.open();
      yield* Effect.yieldNow;
      yield* TestClock.adjust("29 seconds");
      expect(line.sent).toEqual([]);
      yield* TestClock.adjust("1 second");
      expect(line.sent).toEqual([SCOPE_PING]);
      line.handlers.message(SCOPE_PONG);
      yield* Effect.yieldNow;
      yield* TestClock.adjust("30 seconds");
      expect(line.sent).toEqual([SCOPE_PING, SCOPE_PING]);
      line.handlers.message(SCOPE_PONG);
      yield* Effect.yieldNow;
      yield* TestClock.adjust("29 seconds");
      expect(line.closed).toBe(false);
      expect(yield* Queue.size(lines)).toBe(0);
    }),
  );

  it.effect("reconnects when a pong doesn't come, and catches up once per connection", () =>
    Effect.gen(function* () {
      const { hub, lines, heard, listener } = yield* setup();
      hub.watch(scope, listener);
      const first = yield* Queue.take(lines);
      first.handlers.open();
      yield* Effect.yieldNow;
      yield* TestClock.adjust("30 seconds");
      yield* TestClock.adjust("9 seconds");
      expect(first.closed).toBe(false);
      yield* TestClock.adjust("1 second");
      expect(first.closed).toBe(true);

      yield* TestClock.adjust("30 seconds");
      const second = yield* Queue.take(lines);
      expect(second.authorization).toBe("Bearer token-2");
      second.handlers.open();
      yield* Effect.yieldNow;
      expect(heard.connections).toBe(2);
    }),
  );

  it.effect("keeps the socket when the app goes inactive, closes it in the background", () =>
    Effect.gen(function* () {
      const { hub, lines, listener, appState } = yield* setup();
      hub.watch(scope, listener);
      const first = yield* Queue.take(lines);
      first.handlers.open();
      yield* Effect.yieldNow;

      appState("inactive");
      yield* Effect.yieldNow;
      expect(first.closed).toBe(false);

      appState("background");
      yield* Effect.yieldNow;
      expect(first.closed).toBe(true);
      yield* TestClock.adjust("1 minute");
      expect(yield* Queue.size(lines)).toBe(0);

      appState("active");
      const second = yield* Queue.take(lines);
      expect(second.authorization).toBe("Bearer token-2");
    }),
  );

  it.effect("shares one socket per scope and closes it when the last watcher leaves", () =>
    Effect.gen(function* () {
      const { hub, lines, heard, listener } = yield* setup();
      const other: ScopeListener = { notice: () => {}, connected: () => {} };
      const release = hub.watch(scope, listener);
      const releaseOther = hub.watch(scope, other);
      const line = yield* Queue.take(lines);
      line.handlers.open();
      yield* Effect.yieldNow;
      line.handlers.message(notice);
      yield* Effect.yieldNow;
      expect(heard.notices).toBe(1);
      expect(yield* Queue.size(lines)).toBe(0);

      release();
      yield* Effect.yieldNow;
      expect(line.closed).toBe(false);
      releaseOther();
      yield* Effect.yieldNow;
      expect(line.closed).toBe(true);
    }),
  );

  it.effect("doesn't connect without a token", () =>
    Effect.gen(function* () {
      const { hub, lines, listener } = yield* setup({ token: null });
      hub.watch(scope, listener);
      yield* TestClock.adjust("1 minute");

      expect(yield* Queue.size(lines)).toBe(0);
    }),
  );

  it.effect("stops reconnecting when the scope's view is refused, and retries otherwise", () =>
    Effect.gen(function* () {
      const refused = yield* setup({ watchable: false });
      refused.hub.watch(scope, refused.listener);
      (yield* Queue.take(refused.lines)).handlers.close(1006);
      yield* Effect.yieldNow;
      yield* TestClock.adjust("1 minute");
      expect(yield* Queue.size(refused.lines)).toBe(0);

      const flaky = yield* setup();
      flaky.hub.watch(scope, flaky.listener);
      (yield* Queue.take(flaky.lines)).handlers.close(1006);
      yield* Effect.yieldNow;
      yield* TestClock.adjust("1 minute");
      expect(yield* Queue.size(flaky.lines)).toBe(1);
    }),
  );
});
