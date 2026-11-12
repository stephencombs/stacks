import { RegistryContext, scheduleTask, useAtomRefresh, useAtomSet } from "@effect/atom-react";
import type { SessionId, TripId } from "@stacks/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type * as Atom from "effect/reactivity/Atom";
import type * as AsyncResult from "effect/reactivity/AsyncResult";
import * as AtomRegistry from "effect/reactivity/AtomRegistry";
import {
  createContext,
  use,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { LEDGER_KEYS, type Stacks } from "./api.ts";
import { describeError } from "./errors.ts";
import { CACHE_MS, shouldRevalidate } from "./freshness.ts";
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
    if (Exit.isSuccess(exit)) ledgerChanged();
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

/** How often entries waiting for signal try again while the app is open. */
const RETRY_MS = 15_000;

/**
 * What the app keeps for whoever is signed in: their API client, query cache, last trip and
 * outbox. Making it starts nothing; `SignedInRoot` holds one per user and keeps it sending.
 */
export const makeSignedIn = ({
  stacks,
  outbox,
  lastTrip,
  capture,
}: {
  stacks: Stacks;
  outbox: OutboxStorage;
  lastTrip: LastTripStorage;
  capture: (event: TestEvent) => void;
}) => {
  const registry = AtomRegistry.make({ scheduleTask, defaultIdleTTL: CACHE_MS });
  const addEntry = stacks.Client.mutation("ledger", "addEntry");
  return {
    stacks,
    registry,
    lastTrip: makeLastTripStore(lastTrip),
    outbox: makeOutbox(outbox, async ({ sessionId, entry }) => {
      const release = registry.mount(addEntry);
      try {
        registry.set(addEntry, {
          params: { sessionId },
          payload: entry,
          reactivityKeys: LEDGER_KEYS,
        });
        const exit = await Effect.runPromiseExit(
          AtomRegistry.getResult(registry, addEntry, { suspendOnWaiting: true }),
        );
        if (Exit.isSuccess(exit)) {
          ledgerChanged();
          try {
            capture("entry_confirmed");
          } catch {
            // A confirmed entry must not be retried because telemetry failed.
          }
        }
        return { error: Exit.isFailure(exit) ? Cause.squash(exit.cause) : null };
      } finally {
        release();
      }
    }),
  };
};
type SignedIn = ReturnType<typeof makeSignedIn>;

const SignedInContext = createContext<SignedIn | null>(null);

/**
 * Holds what's kept for whoever is signed in, from the root of the app, so their outbox keeps
 * sending wherever they are, pages that need no account included. It renders `children` in the
 * same place signed in or out: signing in must not remount the page on screen. One user's
 * outbox exists once, so two copies never overwrite each other's saved queue. `make` and `wake`
 * must be stable, module-level functions; `wake` lets the platform say "try now", such as the app
 * returning to the foreground or the browser coming back online.
 */
export function SignedInRoot({
  userId,
  make,
  wake,
  children,
}: {
  userId: string | null;
  make: (userId: string) => SignedIn;
  wake: (flush: () => void) => () => void;
  children: ReactNode;
}) {
  const hold = (id: string | null) => ({ userId: id, signedIn: id ? make(id) : null });
  const [held, setHeld] = useState(() => hold(userId));
  if (held.userId !== userId) setHeld(hold(userId));
  return (
    <SignedInContext value={held.signedIn}>
      {held.signedIn ? (
        <KeepSending key={held.userId} signedIn={held.signedIn} wake={wake} />
      ) : null}
      {children}
    </SignedInContext>
  );
}

/** Sends what's waiting now, whenever `wake` says, and every little while until it's through. */
function KeepSending({
  signedIn: { outbox, registry },
  wake,
}: {
  signedIn: SignedIn;
  wake: (flush: () => void) => () => void;
}) {
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
  // Dropped a moment after this user leaves; strict mode's remount comes back before then.
  const leaving = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(leaving.current);
    return () => {
      leaving.current = setTimeout(() => registry.dispose(), 500);
    };
  }, [registry]);
  return null;
}

/** The signed-in user's client, cache, last trip and outbox, for the screens of their account. */
export function SignedInScope({ children }: { children: ReactNode }) {
  const signedIn = use(SignedInContext);
  if (!signedIn) throw new Error("SignedInScope needs someone signed in above it");
  return (
    <StacksContext value={signedIn.stacks}>
      <RegistryContext value={signedIn.registry}>
        <LastTripContext value={signedIn.lastTrip}>
          <OutboxContext value={signedIn.outbox}>{children}</OutboxContext>
        </LastTripContext>
      </RegistryContext>
    </StacksContext>
  );
}

/** The signed-in user's outbox, or null while nobody is. */
export const useSignedInOutbox = () => use(SignedInContext)?.outbox ?? null;

const OutboxContext = createContext<Outbox | null>(null);

export const useOutbox = () => {
  const outbox = use(OutboxContext);
  if (!outbox) throw new Error("useOutbox needs a SignedInScope above it");
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

export const useLastTrip = () => {
  const store = use(LastTripContext);
  if (!store) throw new Error("useLastTrip needs a SignedInScope above it");
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
/** When this client last wrote to the ledger. */
let ledgerChangedAt = 0;
const ledgerChanged = () => {
  ledgerChangedAt = Date.now();
};

/** Retry reads the registry so two presses before the next render still start one request. */
export function useQueryRetry<A, E>(query: Atom.Atom<AsyncResult.AsyncResult<A, E>>) {
  const registry = use(RegistryContext);
  const refresh = useAtomRefresh(query);
  return () => {
    if (registry.get(query).waiting) return;
    lastRevalidated.set(query, Date.now());
    refresh();
  };
}

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
  const revalidate = useEffectEvent((shown: typeof query) => {
    const now = Date.now();
    if (!shouldRevalidate(result, now, lastRevalidated.get(shown), ledgerChangedAt)) return;
    lastRevalidated.set(shown, now);
    refresh();
  });
  useEffect(() => {
    revalidate(query);
    return onWake(() => revalidate(query));
  }, [onWake, query]);
}
