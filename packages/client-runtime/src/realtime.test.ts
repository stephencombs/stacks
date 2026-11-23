import { describe, expect, it } from "@effect/vitest";
import { SCOPE_PING, SCOPE_PONG } from "@stacks/contracts";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as TestClock from "effect/testing/TestClock";

import type { ScopeListener } from "./realtime.ts";
import { notice, scope, setup } from "./realtimeFake.test-utils.ts";

describe("scope hub", () => {
  it.effect("listens to the app's state only while something is watched", () =>
    Effect.gen(function* () {
      const { hub, lines, listener, subscriptions, changes } = yield* setup();
      expect(subscriptions).toEqual({ opened: 0, closed: 0 });
      expect(changes.size).toBe(0);

      const stop = hub.watch(scope, listener);
      yield* Queue.take(lines);
      expect(subscriptions).toEqual({ opened: 1, closed: 0 });

      stop();
      expect(subscriptions).toEqual({ opened: 1, closed: 1 });
      expect(changes.size).toBe(0);

      hub.watch(scope, listener);
      expect(subscriptions).toEqual({ opened: 2, closed: 1 });
      hub.dispose();
      expect(subscriptions).toEqual({ opened: 2, closed: 2 });
    }),
  );

  it.effect("ignores the notices its own install wrote, and hears everyone else", () =>
    Effect.gen(function* () {
      const { hub, lines, heard, listener } = yield* setup({ origin: "mine" });
      hub.watch(scope, listener);
      const line = yield* Queue.take(lines);
      line.handlers.open();
      yield* Effect.yieldNow;

      for (const origin of ["mine", "theirs", null]) {
        line.handlers.message(JSON.stringify({ scope, origin }));
        yield* Effect.yieldNow;
      }

      expect(heard.notices).toBe(2);
    }),
  );

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

  it.effect("reconnects when a ping can't be sent", () =>
    Effect.gen(function* () {
      const { hub, lines, listener } = yield* setup();
      hub.watch(scope, listener);
      const first = yield* Queue.take(lines);
      first.handlers.open();
      yield* Effect.yieldNow;
      first.failing = true;
      yield* TestClock.adjust("30 seconds");
      expect(first.closed).toBe(true);

      yield* TestClock.adjust("30 seconds");
      const second = yield* Queue.take(lines);
      expect(second.authorization).toBe("Bearer token-2");
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
