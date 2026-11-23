import {
  RegistryContext,
  scheduleTask,
  useAtomRefresh,
  useAtomSet,
  useAtomValue,
} from "@effect/atom-react";
import type { GroupId, SessionId, TripId } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
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
import {
  CACHE_MS,
  ledgerChanged,
  ledgerSyncCount,
  lastLedgerChange,
  shouldRevalidate,
  subscribeLedgerSynced,
} from "./freshness.ts";
import {
  OutboxLive,
  OutboxService,
  type Outbox,
  type OutboxStorage,
  type Pending,
  type SendEntry,
} from "./outbox.ts";
import {
  StatsCopiesLive,
  StatsCopiesService,
  statsState,
  type StatsCopies,
  type StatsCopyStorage,
} from "./statsCopy.ts";
import {
  LastTripStoreLive,
  LastTripStoreService,
  type LastTripStorage,
  type LastTripStore,
} from "./trip.ts";
import { ScopeHubContext, useNoticeTarget } from "./realtimeReact.tsx";
import type { ScopeHub } from "./realtime.ts";
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

  const attempt = async (arg: Omit<Arg, "reactivityKeys">) => {
    setState({ pending: true, error: null });
    // SAFETY: arg is the mutation without reactivityKeys, and LEDGER_KEYS is the key list Arg requires.
    const exit = await run({ ...arg, reactivityKeys: LEDGER_KEYS } as Arg);
    const error = Exit.isFailure(exit) ? describeError(Cause.squash(exit.cause)) : null;

    if (Exit.isSuccess(exit)) ledgerChanged();

    if (Exit.isSuccess(exit) && event) {
      try {
        capture(event);
      } catch {}
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

const RETRY_MS = 15_000;

/**
 * What the app keeps for whoever is signed in: their API client, query cache, last trip, outbox
 * and the last copy of each group's stats. Making it starts nothing; `SignedInRoot` holds one per
 * user and keeps it sending.
 */
export const makeSignedIn = ({
  stacks,
  outbox,
  lastTrip,
  statsCopies,
  scopeHub,
  capture,
}: {
  stacks: Stacks;
  outbox: OutboxStorage;
  lastTrip: LastTripStorage;
  statsCopies: StatsCopyStorage;
  scopeHub: ScopeHub;
  capture: (event: TestEvent) => void;
}) => {
  const registry = AtomRegistry.make({ scheduleTask, defaultIdleTTL: CACHE_MS });
  const addEntry = stacks.Client.mutation("ledger", "addEntry");

  const send: SendEntry = async ({ sessionId, entry }) => {
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
        } catch {}
      }

      return { error: Exit.isFailure(exit) ? Cause.squash(exit.cause) : null };
    } finally {
      release();
    }
  };

  return Effect.runSync(
    Effect.gen(function* () {
      return {
        stacks,
        registry,
        lastTrip: yield* LastTripStoreService,
        statsCopies: yield* StatsCopiesService,
        outbox: yield* OutboxService,
        scopeHub,
      };
    }).pipe(
      Effect.provide(LastTripStoreLive(lastTrip)),
      Effect.provide(StatsCopiesLive(statsCopies)),
      Effect.provide(OutboxLive(outbox, send)),
    ),
  );
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

function KeepSending({
  signedIn: { outbox, registry, scopeHub },
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
  const leaving = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(leaving.current);

    return () => {
      leaving.current = setTimeout(() => {
        registry.dispose();
        scopeHub.dispose();
      }, 500);
    };
  }, [registry, scopeHub]);

  return null;
}

/** The signed-in user's client, cache, last trip and outbox, for the screens of their account. */
export function SignedInScope({ children }: { children: ReactNode }) {
  const signedIn = use(SignedInContext);

  if (!signedIn) throw new Error("SignedInScope needs someone signed in above it");

  return (
    <StacksContext value={signedIn.stacks}>
      <RegistryContext value={signedIn.registry}>
        <ScopeHubContext value={signedIn.scopeHub}>
          <LastTripContext value={signedIn.lastTrip}>
            <StatsCopiesContext value={signedIn.statsCopies}>
              <OutboxContext value={signedIn.outbox}>{children}</OutboxContext>
            </StatsCopiesContext>
          </LastTripContext>
        </ScopeHubContext>
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
    pending: pending.filter((p) => !known.has(p.entry.id)),
    sent: sent.filter((p) => p.sessionId === sessionId && !known.has(p.entry.id)),
  };
};

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

const StatsCopiesContext = createContext<StatsCopies | null>(null);

/** The signed-in user's cached group stats copies, or null while nobody is signed in. */
export const useStatsCopies = () => use(StatsCopiesContext);

/**
 * A group's stats and the group they belong to, kept fresh like `<Loaded>`. Each fetch is kept on
 * the device, so offline the last copy shows; the API refusing, as when you've left the group,
 * forgets it.
 */
export function useGroupStats(groupId: GroupId, onWake: (revalidate: () => void) => () => void) {
  const stacks = useStacks();
  const copies = use(StatsCopiesContext);

  if (!copies) throw new Error("useGroupStats needs a SignedInScope above it");
  const detailQuery = stacks.group(groupId);
  const statsQuery = stacks.stats(groupId);
  const detail = useAtomValue(detailQuery);
  const stats = useAtomValue(statsQuery);
  useRevalidate(detailQuery, detail, onWake);
  useRevalidate(statsQuery, stats, onWake);
  const state = statsState(detail, stats, () => copies.load(groupId));

  const keep = useEffectEvent((id: GroupId, kind: typeof state.kind, fetchedAt: number | null) => {
    if (kind === "live" && fetchedAt !== null && state.kind === "live")
      copies.save(id, {
        fetchedAt: DateTime.makeUnsafe(fetchedAt),
        detail: state.detail,
        stats: state.stats,
      });

    if (kind === "refused") copies.forget(id);
  });

  const fetchedAt = state.kind === "live" ? state.fetchedAt : null;
  useEffect(() => keep(groupId, state.kind, fetchedAt), [groupId, state.kind, fetchedAt]);

  return state;
}

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
  useNoticeTarget(query);

  const revalidate = useEffectEvent(() => {
    const now = Date.now();

    if (!shouldRevalidate(result, now, lastRevalidated.get(query), lastLedgerChange())) return;
    lastRevalidated.set(query, now);
    refresh();
  });

  useEffect(() => {
    revalidate();

    return onWake(() => revalidate());
  }, [onWake]);
  const syncs = useSyncExternalStore(subscribeLedgerSynced, ledgerSyncCount);
  const first = useRef(syncs);
  useEffect(() => {
    if (first.current === syncs) return;
    first.current = syncs;
    revalidate();
  }, [syncs]);
}
