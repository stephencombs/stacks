import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import type * as Atom from "effect/reactivity/Atom";
import type * as AsyncResult from "effect/reactivity/AsyncResult";
import type * as AtomRegistry from "effect/reactivity/AtomRegistry";

import type { Fork } from "./realtime.ts";

/** A query on screen: it can be refetched, and says when a fetch starts and ends. */
export interface RefreshTarget {
  readonly refresh: () => void;
  /** Calls back with the current state at once, then on each change; returns how to stop. */
  readonly watchWaiting: (listener: (waiting: boolean) => void) => () => void;
}

/** Notices arriving within this window of each other cause one refetch. */
export const COALESCE = Duration.millis(200);

export const registryTarget = <A, E>(
  registry: AtomRegistry.AtomRegistry,
  query: Atom.Atom<AsyncResult.AsyncResult<A, E>>,
) =>
  ({
    refresh: () => registry.refresh(query),
    watchWaiting: (listener) =>
      registry.subscribe(query, (result) => listener(result.waiting), { immediate: true }),
  }) satisfies RefreshTarget;

/**
 * Refetches the queries on a screen when the scope they're about changes. A notice marks each
 * query dirty and the mark clears when a fetch starts, so a notice that lands while a fetch is
 * already running gets one more fetch when it ends. It doesn't ask `shouldRevalidate`: a notice
 * is the reason to fetch, however fresh the data looks.
 */
export const createNoticeRefresh = (fork: Fork = Effect.runFork) => {
  const targets = new Set<{ readonly target: RefreshTarget; dirty: boolean; waiting: boolean }>();
  let coalescing = false;

  const flush = () => {
    for (const entry of targets) {
      if (entry.dirty && !entry.waiting) entry.target.refresh();
    }
  };

  const mark = () => {
    for (const entry of targets) entry.dirty = true;
  };

  return {
    register: (target: RefreshTarget) => {
      const entry = { target, dirty: false, waiting: false };
      targets.add(entry);

      const stop = target.watchWaiting((waiting) => {
        const ended = entry.waiting && !waiting;

        if (waiting && !entry.waiting) entry.dirty = false;
        entry.waiting = waiting;

        if (ended && entry.dirty) target.refresh();
      });

      return () => {
        stop();
        targets.delete(entry);
      };
    },
    notice: () => {
      mark();

      if (coalescing) return;
      coalescing = true;

      fork(
        Effect.sleep(COALESCE).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              coalescing = false;
            }),
          ),
          Effect.andThen(Effect.sync(flush)),
        ),
      );
    },
    catchUp: () => {
      mark();
      flush();
    },
  };
};

export type NoticeRefresh = ReturnType<typeof createNoticeRefresh>;
