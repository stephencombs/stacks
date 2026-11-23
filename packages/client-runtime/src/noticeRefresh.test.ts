import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Atom from "effect/reactivity/Atom";
import * as AtomRegistry from "effect/reactivity/AtomRegistry";
import * as TestClock from "effect/testing/TestClock";

import { DEDUPE_MS } from "./freshness.ts";
import { createNoticeRefresh, registryTarget, type RefreshTarget } from "./noticeRefresh.ts";

const testFork = Effect.map(Effect.context<never>(), (context) => Effect.runForkWith(context));

const shownQuery = () => {
  let waiting = false;
  let fetches = 0;
  const listeners = new Set<(waiting: boolean) => void>();

  const set = (next: boolean) => {
    waiting = next;

    for (const listener of listeners) listener(next);
  };

  const target: RefreshTarget = {
    refresh: () => {
      fetches += 1;
      set(true);
    },
    watchWaiting: (listener) => {
      listeners.add(listener);
      listener(waiting);

      return () => void listeners.delete(listener);
    },
  };

  return { target, fetches: () => fetches, finish: () => set(false) };
};

describe("noticeRefresh", () => {
  it.effect("refetches once for a burst of notices", () =>
    Effect.gen(function* () {
      const refresh = createNoticeRefresh(yield* testFork);
      const query = shownQuery();
      refresh.register(query.target);

      for (let i = 0; i < 5; i++) {
        refresh.notice();
        yield* TestClock.adjust("30 millis");
      }

      expect(query.fetches()).toBe(0);
      yield* TestClock.adjust("200 millis");
      expect(query.fetches()).toBe(1);
      query.finish();
      yield* TestClock.adjust("5 seconds");
      expect(query.fetches()).toBe(1);
    }),
  );

  it.effect("refetches once more when a notice lands during a fetch that ends after it", () =>
    Effect.gen(function* () {
      const refresh = createNoticeRefresh(yield* testFork);
      const query = shownQuery();
      refresh.register(query.target);
      query.target.refresh();
      refresh.notice();
      yield* TestClock.adjust("1 second");
      expect(query.fetches()).toBe(1);
      query.finish();
      expect(query.fetches()).toBe(2);
      query.finish();
      yield* TestClock.adjust("5 seconds");
      expect(query.fetches()).toBe(2);
    }),
  );

  it.effect("needs no trailing fetch when a fetch started after the notice", () =>
    Effect.gen(function* () {
      const refresh = createNoticeRefresh(yield* testFork);
      const query = shownQuery();
      refresh.register(query.target);
      refresh.notice();
      query.target.refresh();
      yield* TestClock.adjust("1 second");
      query.finish();
      expect(query.fetches()).toBe(1);
    }),
  );

  it.effect("refetches for a notice inside the dedupe window of the last fetch", () =>
    Effect.gen(function* () {
      const refresh = createNoticeRefresh(yield* testFork);
      const query = shownQuery();
      refresh.register(query.target);
      refresh.notice();
      yield* TestClock.adjust("200 millis");
      query.finish();
      yield* TestClock.adjust("100 millis");
      refresh.notice();
      yield* TestClock.adjust("200 millis");

      expect(400).toBeLessThan(DEDUPE_MS);
      expect(query.fetches()).toBe(2);
    }),
  );

  it.effect(
    "refetches every query once for a burst, one already fetching getting a single more",
    () =>
      Effect.gen(function* () {
        const refresh = createNoticeRefresh(yield* testFork);
        const [idle, busy] = [shownQuery(), shownQuery()];
        refresh.register(idle.target);
        refresh.register(busy.target);
        busy.target.refresh();

        for (let i = 0; i < 3; i++) {
          refresh.notice();
          yield* TestClock.adjust("50 millis");
        }

        yield* TestClock.adjust("200 millis");
        expect([idle.fetches(), busy.fetches()]).toEqual([1, 1]);
        busy.finish();
        expect(busy.fetches()).toBe(2);
        idle.finish();
        busy.finish();
        yield* TestClock.adjust("5 seconds");
        expect([idle.fetches(), busy.fetches()]).toEqual([1, 2]);
      }),
  );

  it.effect("stops refetching a query once it's unregistered", () =>
    Effect.gen(function* () {
      const refresh = createNoticeRefresh(yield* testFork);
      const query = shownQuery();
      const unregister = refresh.register(query.target);
      unregister();
      refresh.notice();
      yield* TestClock.adjust("1 second");

      expect(query.fetches()).toBe(0);
    }),
  );

  it.effect("refetches an atom through the registry", () =>
    Effect.gen(function* () {
      const registry = AtomRegistry.make();
      const refresh = createNoticeRefresh(yield* testFork);
      let fetches = 0;

      const query = Atom.make(
        Effect.promise(async () => {
          fetches += 1;

          return fetches;
        }),
      );

      const release = registry.mount(query);
      refresh.register(registryTarget(registry, query));
      yield* Effect.promise(() => Promise.resolve());
      expect(fetches).toBe(1);
      refresh.notice();
      yield* TestClock.adjust("200 millis");
      yield* Effect.promise(() => Promise.resolve());
      expect(fetches).toBe(2);
      release();
    }),
  );
});
