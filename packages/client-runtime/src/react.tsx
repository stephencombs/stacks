import { useAtomRefresh, useAtomSet } from "@effect/atom-react";
import type { SessionId, TripId } from "@stacks/contracts";
import * as Cause from "effect/Cause";
import * as Exit from "effect/Exit";
import type * as Atom from "effect/reactivity/Atom";
import type * as AsyncResult from "effect/reactivity/AsyncResult";
import {
  createContext,
  use,
  useEffect,
  useEffectEvent,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { LEDGER_KEYS, type Stacks } from "./api.ts";
import { describeError } from "./errors.ts";
import { shouldRevalidate } from "./freshness.ts";
import { makeOutbox, type Outbox, type OutboxStorage, type Pending } from "./outbox.ts";
import { makeLastTripStore, type LastTripStorage } from "./trip.ts";
import type { TestEvent } from "./telemetry.ts";

export const TelemetryContext = createContext<(event: TestEvent) => void>(() => {});

/** Each app provides its own client, built with its own way of getting the Clerk token. */
export const StacksContext = createContext<Stacks | null>(null);

export const useStacks = () => {
  const stacks = use(StacksContext);
  if (!stacks) throw new Error("useStacks needs a StacksContext provider above it");
  return stacks;
};

/**
 * Runs an API mutation and refreshes what's on screen afterwards. Failures come back as a
 * sentence for the person, never thrown.
 */
export function useAction<Arg, A, E>(mutation: Atom.AtomResultFn<Arg, A, E>, event?: TestEvent) {
  const capture = use(TelemetryContext);
  const run = useAtomSet(mutation, { mode: "promiseExit" });
  const [state, setState] = useState<{ pending: boolean; error: string | null }>({
    pending: false,
    error: null,
  });
  /** Like `run`, but hands back the failure sentence too, for callers that show it elsewhere. */
  const attempt = async (arg: Omit<Arg, "reactivityKeys">) => {
    setState({ pending: true, error: null });
    const exit = await run({ ...arg, reactivityKeys: LEDGER_KEYS } as Arg);
    const error = Exit.isFailure(exit) ? describeError(Cause.squash(exit.cause)) : null;
    if (Exit.isSuccess(exit) && event) {
      try {
        capture(event);
      } catch {
        // Telemetry must not change the result of a ledger action.
      }
    }
    setState({ pending: false, error });
    return { value: Exit.isSuccess(exit) ? exit.value : null, error };
  };
  const execute = async (arg: Omit<Arg, "reactivityKeys">) => (await attempt(arg)).value;
  return {
    run: execute,
    attempt,
    ...state,
    clearError: () => setState((s) => ({ ...s, error: null })),
  };
}

const OutboxContext = createContext<Outbox | null>(null);
/** How often entries waiting for signal try again while the app is open. */
const RETRY_MS = 15_000;

/**
 * Holds entries until the server confirms them, for the whole signed-in app, so leaving a
 * screen doesn't lose what was logged on it. `wake` lets the platform say "try now", such as
 * the app returning to the foreground or the browser coming back online.
 */
export function OutboxProvider({
  storage,
  wake,
  children,
}: {
  storage: OutboxStorage;
  wake: (flush: () => void) => () => void;
  children: ReactNode;
}) {
  const stacks = useStacks();
  const capture = use(TelemetryContext);
  const add = useAtomSet(stacks.Client.mutation("ledger", "addEntry"), { mode: "promiseExit" });
  const [outbox] = useState(() =>
    makeOutbox(storage, async ({ sessionId, entry }) => {
      const exit = await add({
        params: { sessionId },
        payload: entry,
        reactivityKeys: LEDGER_KEYS,
      });
      if (Exit.isSuccess(exit)) {
        try {
          capture("entry_confirmed");
        } catch {
          // A confirmed entry must not be retried because telemetry failed.
        }
      }
      return { error: Exit.isFailure(exit) ? Cause.squash(exit.cause) : null };
    }),
  );
  const pending = useSyncExternalStore(outbox.subscribe, outbox.pending);
  const waiting = pending.some((p) => p.failed === null);

  useEffect(() => {
    void outbox.flush();
    return wake(() => void outbox.flush());
  }, [outbox, wake]);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void outbox.flush(), RETRY_MS);
    return () => clearInterval(timer);
  }, [outbox, waiting]);

  return <OutboxContext value={outbox}>{children}</OutboxContext>;
}

export const useOutbox = () => {
  const outbox = use(OutboxContext);
  if (!outbox) throw new Error("useOutbox needs an OutboxProvider above it");
  return outbox;
};

/** Entries for one session the server hasn't confirmed yet, oldest first. */
export const usePending = (sessionId: SessionId) => {
  const outbox = useOutbox();
  const pending = useSyncExternalStore(outbox.subscribe, outbox.pending);
  return pending.filter((p) => p.sessionId === sessionId);
};

export const useAllOutboxEntries = () => {
  const outbox = useOutbox();
  const pending = useSyncExternalStore(outbox.subscribe, outbox.pending);
  const sent = useSyncExternalStore(outbox.subscribe, outbox.sent);
  return { pending, sent };
};

/**
 * Everything recorded here for a session that the given saved entries don't include yet:
 * entries still waiting, and ones the server confirmed that haven't come back in a refetch.
 */
export const useUnsaved = (
  sessionId: SessionId,
  saved: ReadonlyArray<{ readonly id: Pending["entry"]["id"] }>,
) => {
  const outbox = useOutbox();
  const pending = usePending(sessionId);
  const sent = useSyncExternalStore(outbox.subscribe, outbox.sent);
  const known = new Set(saved.map((entry) => entry.id));
  return {
    /** Waiting to be sent, or refused. */
    pending: pending.filter((p) => !known.has(p.entry.id)),
    /** Confirmed, and still to show up in what the screen has. */
    sent: sent.filter((p) => p.sessionId === sessionId && !known.has(p.entry.id)),
  };
};

type LastTripStore = ReturnType<typeof makeLastTripStore>;

const LastTripContext = createContext<LastTripStore | null>(null);

export function LastTripProvider({
  storage,
  children,
}: {
  storage: LastTripStorage;
  children: ReactNode;
}) {
  const [store] = useState(() => makeLastTripStore(storage));
  return <LastTripContext value={store}>{children}</LastTripContext>;
}

export const useLastTrip = () => {
  const store = use(LastTripContext);
  if (!store) throw new Error("useLastTrip needs a LastTripProvider above it");
  const lastTripId = useSyncExternalStore(store.subscribe, store.get);
  return { lastTripId, setLastTripId: store.set };
};

export const useRememberTrip = (tripId: TripId) => {
  const store = use(LastTripContext);
  useEffect(() => {
    store?.set(tripId);
  }, [store, tripId]);
};

/** When each query last refetched in the background, so screens sharing one ask only once. */
const lastRevalidated = new WeakMap<object, number>();

/**
 * Keeps a shown query fresh without ever blanking it: when the screen mounts, and whenever
 * `onWake` reports the app coming back (focus, reconnect, foreground), stale data refetches in the
 * background while the old copy stays up. `onWake` must be a stable, module-level function.
 */
export function useRevalidate<A, E>(
  query: Atom.Atom<AsyncResult.AsyncResult<A, E>>,
  result: AsyncResult.AsyncResult<A, E>,
  onWake: (revalidate: () => void) => () => void,
) {
  const refresh = useAtomRefresh(query);
  const revalidate = useEffectEvent(() => {
    const now = Date.now();
    if (!shouldRevalidate(result, now, lastRevalidated.get(query))) return;
    lastRevalidated.set(query, now);
    refresh();
  });
  useEffect(() => {
    revalidate();
    return onWake(() => revalidate());
  }, [onWake]);
}
