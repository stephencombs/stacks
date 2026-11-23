import { describe, expect, it } from "@effect/vitest";
import { GroupId, groupScope } from "@stacks/contracts";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as TestClock from "effect/testing/TestClock";

import { createNoticeRefresh, type RefreshTarget } from "./noticeRefresh.ts";
import { setup } from "./realtimeFake.test-utils.ts";
import { watchScopes } from "./screenNotices.ts";

const scopeOf = (n: number) => groupScope(GroupId.make(`0192e7a0-0000-7000-8000-00000000010${n}`));

const shownQuery = () => {
  let fetches = 0;
  const listeners = new Set<(waiting: boolean) => void>();

  const target: RefreshTarget = {
    refresh: () => {
      fetches += 1;

      for (const listener of listeners) listener(true);
    },
    watchWaiting: (listener) => {
      listeners.add(listener);
      listener(false);

      return () => void listeners.delete(listener);
    },
  };

  const finish = () => {
    for (const listener of listeners) listener(false);
  };

  return { target, fetches: () => fetches, finish };
};

describe("screen notices", () => {
  it.effect("keeps the sockets of scopes that stay when others are added or dropped", () =>
    Effect.gen(function* () {
      const { hub, lines, fork } = yield* setup();
      const watching = watchScopes(hub, createNoticeRefresh(fork));
      const [a, b, c] = [scopeOf(1), scopeOf(2), scopeOf(3)];

      watching.set([a]);
      const first = yield* Queue.take(lines);

      watching.set([a, b]);
      const second = yield* Queue.take(lines);
      expect(first.closed).toBe(false);
      expect(second.url).toContain(b);
      expect(yield* Queue.size(lines)).toBe(0);

      watching.set([b, c]);
      const third = yield* Queue.take(lines);
      yield* Effect.yieldNow;
      expect(first.closed).toBe(true);
      expect(second.closed).toBe(false);
      expect(third.url).toContain(c);
      expect(yield* Queue.size(lines)).toBe(0);
    }),
  );

  it.effect("closes every socket when told to watch nothing, and can start again", () =>
    Effect.gen(function* () {
      const { hub, lines, fork } = yield* setup();
      const watching = watchScopes(hub, createNoticeRefresh(fork));

      watching.set([scopeOf(1), scopeOf(2)]);
      const opened = [yield* Queue.take(lines), yield* Queue.take(lines)];
      watching.set([]);
      yield* Effect.yieldNow;
      expect(opened.map((line) => line.closed)).toEqual([true, true]);

      watching.set([scopeOf(1)]);
      expect((yield* Queue.take(lines)).closed).toBe(false);
    }),
  );

  it.effect("refetches each query once when several sockets open together", () =>
    Effect.gen(function* () {
      const { hub, lines, fork } = yield* setup();
      const refresh = createNoticeRefresh(fork);
      const query = shownQuery();
      refresh.register(query.target);
      const watching = watchScopes(hub, refresh);

      watching.set([scopeOf(1), scopeOf(2), scopeOf(3)]);
      const opened = [yield* Queue.take(lines), yield* Queue.take(lines), yield* Queue.take(lines)];

      for (const line of opened) {
        line.handlers.open();
        yield* Effect.yieldNow;
        yield* TestClock.adjust("50 millis");
      }

      expect(query.fetches()).toBe(0);
      yield* TestClock.adjust("200 millis");
      expect(query.fetches()).toBe(1);
      query.finish();
      yield* TestClock.adjust("5 seconds");
      expect(query.fetches()).toBe(1);
    }),
  );
});
