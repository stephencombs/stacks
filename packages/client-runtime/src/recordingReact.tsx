import {
  UserId,
  type ActorId,
  type PairHistory,
  type PlayerBalances,
  type PlayerId,
  type TableId,
  type VisitId,
} from "@stacks/contracts";
import type {
  JoinedTable,
  PlayerAccess,
  PlayerInviteLink,
  RecordingCommand,
  RecordingOperationId,
  TableView,
} from "@stacks/contracts/recordingCommands";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { describeError } from "./errors.ts";
import { pendingPayments } from "./playerMoney.ts";
import {
  makeRecordingStore,
  RecordingError,
  type RecordingInput,
  type RecordingReceipt,
  type RecordingStore,
} from "./recording.ts";
import type { RecordingStorage, RecordingStorageChange } from "./recordingStorage.ts";
import {
  makeRecordingSync,
  RecordingSyncBlocked,
  syncsAsDevice,
  tableSynced,
  type ActorKeyStorage,
  type RecordingSync,
  type RecordingTransport,
} from "./recordingSync.ts";
import {
  canRetryRecording,
  claimLines,
  describeRecordingError,
  paymentSyncView,
  PRIVATE_RECORDING_NAMESPACE,
  recordingHome,
  recordingSyncView,
  recordingTable,
  recordingVisit,
} from "./recordingView.ts";

/**
 * Hands the store an adapter at once and opens the platform's storage on first use, so the store
 * exists synchronously and a failed open becomes its visible load failure, retried by `refresh`.
 */
const deferStorage = (open: () => Promise<RecordingStorage>): RecordingStorage => {
  let opening: Promise<RecordingStorage> | undefined;
  let detach: (() => void) | undefined;
  const listeners = new Set<(change: RecordingStorageChange) => void>();
  const opened = () =>
    (opening ??= open().then(
      (storage) => {
        detach = storage.subscribe((change) => {
          for (const listener of listeners) listener(change);
        });
        return storage;
      },
      (error: unknown) => {
        opening = undefined;
        throw error;
      },
    ));
  return {
    load: async () => (await opened()).load(),
    commit: async (expected, payload) => (await opened()).commit(expected, payload),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    close: async () => {
      const storage = await opening?.catch(() => null);
      detach?.();
      await storage?.close();
    },
  };
};

/**
 * The device's private recording store. Make one per app, outside React: it outlives sign-in,
 * sign-out and remounts, so no effect can open a second copy or close the live one.
 */
export const openDeviceRecordingStore = (
  open: (namespace: string) => Promise<RecordingStorage>,
): RecordingStore => {
  const store = makeRecordingStore(deferStorage(() => open(PRIVATE_RECORDING_NAMESPACE)));
  // The snapshot reports a failed load; nothing awaits `ready` itself.
  store.ready.catch(() => undefined);
  return store;
};

/**
 * One form's saves. A failed save keeps its prepared command, so submitting the same input again
 * retries it with the same IDs and times instead of recording a second copy. A changed input, a
 * success or a conflict that needs a fresh look prepares anew.
 */
export const makeRecordingSubmission = (store: RecordingStore) => {
  let retained: { readonly key: string; readonly command: RecordingCommand } | null = null;
  return async (input: RecordingInput): Promise<RecordingReceipt> => {
    const key = JSON.stringify(input);
    const command = retained?.key === key ? retained.command : store.prepare(input);
    retained = { key, command };
    try {
      const receipt = await store.execute(command);
      retained = null;
      return receipt;
    } catch (error) {
      if (!canRetryRecording(error)) retained = null;
      throw error;
    }
  };
};

const RecordingContext = createContext<RecordingStore | null>(null);

export function RecordingProvider({
  store,
  children,
}: {
  store: RecordingStore;
  children: ReactNode;
}) {
  return <RecordingContext value={store}>{children}</RecordingContext>;
}

const useRecordingStore = () => {
  const store = use(RecordingContext);
  if (!store) throw new Error("Recording hooks need a RecordingProvider above them");
  return store;
};

/** Load and save state for the whole device ledger, worded for a status line. */
const useSnapshot = () => {
  const store = useRecordingStore();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return {
    status: snapshot.status,
    /** A sentence for a failed load or the last failed save; null otherwise. */
    error:
      snapshot.status === "load_failed" || snapshot.status === "save_failed"
        ? describeRecordingError(snapshot.error)
        : null,
    state: snapshot.state,
    retryLoad: () => store.refresh().catch(() => undefined),
  };
};

/** Home: live visits, finished visits and the finished-only result. `home` is null until loaded. */
export const useRecordingHome = () => {
  const { state, ...snapshot } = useSnapshot();
  const home = useMemo(() => (state ? recordingHome(state) : null), [state]);
  return { ...snapshot, home };
};

/** One visit's review. `visit` is undefined while loading and null when there's no such visit. */
export const useRecordingVisit = (visitId: VisitId) => {
  const { state, ...snapshot } = useSnapshot();
  const visit = useMemo(
    () => (state ? recordingVisit(state, visitId) : undefined),
    [state, visitId],
  );
  return { ...snapshot, visit };
};

const RecordingSyncContext = createContext<RecordingSync | null>(null);

/**
 * While someone is signed in, syncs the device ledger to their account: it uploads what was
 * recorded signed out, restores what other devices synced, and keeps pushing new saves. Signed
 * out, solo play stays on the device; a table with other players at it syncs as the device's own
 * actor, whose secret `keys` holds. `connect`, `keys` and `wake` must be stable, module-level
 * values; `wake` lets the platform say "try now", such as the network returning.
 */
export function RecordingSyncRoot({
  userId,
  connect,
  keys,
  wake,
  children,
}: {
  userId: string | null;
  connect: () => RecordingTransport;
  keys: ActorKeyStorage;
  wake: (now: () => void) => () => void;
  children: ReactNode;
}) {
  const store = useRecordingStore();
  const hold = (id: string | null) => ({
    userId: id,
    sync: makeRecordingSync(store, id === null ? null : UserId.make(id), connect(), keys),
  });
  const [held, setHeld] = useState(() => hold(userId));
  if (held.userId !== userId) setHeld(hold(userId));
  const sync = held.sync;
  useEffect(() => {
    const fiber = Effect.runFork(sync.run);
    const stopWaking = wake(sync.wake);
    return () => {
      stopWaking();
      Effect.runFork(Fiber.interrupt(fiber));
    };
  }, [sync, wake]);
  return <RecordingSyncContext value={sync}>{children}</RecordingSyncContext>;
}

const idle = () => null;
const noSubscription = () => () => undefined;

/**
 * The sync line for Home, or for one visit, and the changes the account refused. `recordAgain`
 * and `discard` resolve each refusal; `error` says why the last one couldn't be resolved.
 */
export const useRecordingSync = (visitId?: VisitId) => {
  const store = useRecordingStore();
  const sync = use(RecordingSyncContext);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const status = useSyncExternalStore(sync?.subscribe ?? noSubscription, sync?.getStatus ?? idle);
  // Signed out, solo play never leaves the device, so there's nothing to report.
  const deviceOnly =
    sync?.userId === null && snapshot.state !== null && !syncsAsDevice(snapshot.state);
  const view = useMemo(
    () => recordingSyncView(snapshot.state, deviceOnly ? null : status, visitId),
    [snapshot.state, status, visitId, deviceOnly],
  );
  const [error, setError] = useState<string | null>(null);
  const resolve =
    (action: "recordAgain" | "discard") => async (operationId: RecordingOperationId) => {
      if (!sync) return;
      setError(null);
      try {
        await sync[action](operationId);
      } catch (cause) {
        setError(describeRecordingError(cause));
      }
    };
  const claim = useMemo(() => claimLines(status?.claim ?? null), [status?.claim]);
  return {
    ...view,
    error,
    recordAgain: resolve("recordAgain"),
    discard: resolve("discard"),
    /** What signing in claimed from this device, or was refused, until dismissed. */
    claim,
    dismissClaim: () => sync?.dismissClaim(),
    /** Whether this device's player can be linked to the account's, which keeps them separate. */
    canLink:
      status?.phase === "blocked" &&
      status.error instanceof RecordingSyncBlocked &&
      status.error.reason === "separate_player",
    link: () => sync?.link(),
  };
};

/**
 * Saves from one form. `submit` resolves with the receipt only once the device has it, or null
 * with `error` set; keep the form open and its values in place until then.
 */
export const useRecordingSubmit = () => {
  const store = useRecordingStore();
  const [submission] = useState(() => makeRecordingSubmission(store));
  const busy = useRef(false);
  const [state, setState] = useState<{ pending: boolean; error: string | null }>({
    pending: false,
    error: null,
  });
  const submit = async (input: RecordingInput) => {
    if (busy.current) return null;
    busy.current = true;
    setState({ pending: true, error: null });
    try {
      const receipt = await submission(input);
      setState({ pending: false, error: null });
      return receipt;
    } catch (error) {
      setState({ pending: false, error: describeRecordingError(error) });
      return null;
    } finally {
      busy.current = false;
    }
  };
  return { ...state, submit, clearError: () => setState((s) => ({ ...s, error: null })) };
};

/** A table and everyone recorded at it. `table` is undefined while loading, null if missing. */
export const useRecordingTable = (tableId: TableId | null) => {
  const { state } = useSnapshot();
  return useMemo(
    () => (state && tableId ? recordingTable(state, tableId) : undefined),
    [state, tableId],
  );
};

/**
 * The starter's share link for a table: `share` makes a new one (an earlier one stops working),
 * `revoke` stops it. A signed-out device's table syncs first; `ready` says it has.
 */
export const useTableSharing = (tableId: TableId) => {
  const store = useRecordingStore();
  const sync = use(RecordingSyncContext);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [state, setState] = useState<{
    token: string | null;
    pending: boolean;
    error: string | null;
  }>({ token: null, pending: false, error: null });
  const ready = snapshot.state !== null && tableSynced(snapshot.state, tableId);
  const run = async (action: () => Promise<string | null>) => {
    if (!sync) return;
    setState((s) => ({ ...s, pending: true, error: null }));
    try {
      const token = await action();
      setState({ token, pending: false, error: null });
    } catch (error) {
      const message =
        error instanceof RecordingError ? describeRecordingError(error) : describeError(error);
      setState((s) => ({ ...s, pending: false, error: message }));
    }
  };
  return {
    ...state,
    ready,
    /** Starts syncing this device's tables; sharing needs the table on the server. */
    prepare: () => sync?.enable(),
    share: () => run(async () => (await sync!.share(tableId)).token),
    revoke: () =>
      run(async () => {
        await sync!.unshare(tableId);
        return null;
      }),
  };
};
/**
 * Joins a shared table through its link as a new player named as typed. It needs the network
 * once; `join` resolves with the table, or null with `error` set.
 */
export const useJoinTable = (token: string) => {
  const sync = use(RecordingSyncContext);
  const [state, setState] = useState<{ pending: boolean; error: string | null }>({
    pending: false,
    error: null,
  });
  const join = async (displayName: string): Promise<JoinedTable | null> => {
    if (!sync) return null;
    setState({ pending: true, error: null });
    try {
      const joined = await sync.join(token, displayName);
      setState({ pending: false, error: null });
      return joined;
    } catch (error) {
      setState({ pending: false, error: describeJoinError(error) });
      return null;
    }
  };
  return { ...state, join };
};

const describeJoinError = (error: unknown) => {
  if (error instanceof RecordingError) return describeRecordingError(error);
  const tag = typeof error === "object" && error !== null && "_tag" in error ? error._tag : null;
  if (tag === "NotFound")
    return "This link doesn't work anymore. Ask whoever shared it for the current one.";
  if (tag === "Conflict" || tag === "Unauthorized") return describeError(error);
  return "Joining needs a connection. Try again once you're online.";
};

/**
 * The whole table as the server has it, for a table this device joined: everyone else's play
 * lives there, not on this device. `undefined` while loading, null when it can't be reached.
 */
export const useServerTable = (tableId: TableId | null) => {
  const store = useRecordingStore();
  const sync = use(RecordingSyncContext);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const enabled =
    snapshot.state !== null &&
    sync !== null &&
    (sync.userId !== null || syncsAsDevice(snapshot.state));
  const [view, setView] = useState<{ id: TableId; view: TableView | null } | null>(null);
  useEffect(() => {
    if (!enabled || !sync || !tableId) return;
    let current = true;
    sync.table(tableId).then(
      (next) => current && setView({ id: tableId, view: next }),
      () => current && setView({ id: tableId, view: null }),
    );
    return () => {
      current = false;
    };
  }, [enabled, sync, tableId]);
  return enabled && view?.id === tableId ? view.view : undefined;
};
/**
 * Hands a player to another device: a single-use invite link (a new one cancels the last), and
 * the devices already recording as them, each of which can be stopped. Needs the network.
 */
export const usePlayerInvite = (playerId: PlayerId) => {
  const sync = use(RecordingSyncContext);
  const [state, setState] = useState<{
    link: PlayerInviteLink | null;
    access: PlayerAccess | null;
    pending: boolean;
    error: string | null;
  }>({ link: null, access: null, pending: false, error: null });
  useEffect(() => {
    if (!sync) return;
    let current = true;
    sync.playerAccess(playerId).then(
      (access) => current && setState((s) => ({ ...s, access })),
      (error: unknown) => current && setState((s) => ({ ...s, error: describeInviteError(error) })),
    );
    return () => {
      current = false;
    };
  }, [sync, playerId]);
  const run = async (action: () => Promise<PlayerInviteLink | null>) => {
    if (!sync) return;
    setState((s) => ({ ...s, pending: true, error: null }));
    try {
      const link = await action();
      const access = await sync.playerAccess(playerId);
      setState({ link, access, pending: false, error: null });
    } catch (error) {
      setState((s) => ({ ...s, pending: false, error: describeInviteError(error) }));
    }
  };
  return {
    ...state,
    issue: () => run(() => sync!.invitePlayer(playerId)),
    /** Cancels the open link, if there is one. */
    cancel: () =>
      run(async () => {
        const open = state.link?.id ?? state.access?.invite?.id;
        if (open) await sync!.revokeInvite(open);
        return null;
      }),
    stopDevice: (actorId: ActorId) =>
      run(async () => {
        await sync!.revokeBinding(playerId, actorId);
        return state.link;
      }),
  };
};

/**
 * Takes up a personal invite: from then on this device records as the player it names, and their
 * tables come with the next sync. Needs the network once.
 */
export const useRedeemInvite = (token: string) => {
  const sync = use(RecordingSyncContext);
  const [state, setState] = useState<{ pending: boolean; error: string | null }>({
    pending: false,
    error: null,
  });
  const redeem = async () => {
    if (!sync) return null;
    setState({ pending: true, error: null });
    try {
      const player = await sync.redeem(token);
      setState({ pending: false, error: null });
      return player;
    } catch (error) {
      setState({ pending: false, error: describeInviteError(error) });
      return null;
    }
  };
  return { ...state, redeem };
};

const describeInviteError = (error: unknown) => {
  if (error instanceof RecordingError) return describeRecordingError(error);
  const tag = typeof error === "object" && error !== null && "_tag" in error ? error._tag : null;
  if (tag === "NotFound") return "This invite doesn't work. Ask whoever sent it for a new one.";
  if (tag === "Conflict" || tag === "Forbidden" || tag === "Unauthorized")
    return describeError(error);
  return "This needs a connection. Try again once you're online.";
};

export type { ActorKeyStorage } from "./recordingSync.ts";

/** A server read: loading, failed with a sentence to show, or ready. */
export type RemoteResult<A> =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: string }
  | { readonly status: "ready"; readonly value: A };

/**
 * Reads from the server through the recording sync, again whenever `key` changes or on `reload`.
 * With no sync (a device that never synced) it's `offline` at once: there's nobody to owe yet.
 */
const useRemote = <A,>(read: (sync: RecordingSync) => Promise<A>, key: string, offline: A) => {
  const sync = use(RecordingSyncContext);
  const [round, setRound] = useState(0);
  const request = `${key}:${round}`;
  const [held, setHeld] = useState<{ request: string; result: RemoteResult<A> } | null>(null);
  useEffect(() => {
    if (!sync) return;
    let current = true;
    read(sync).then(
      (value) => current && setHeld({ request, result: { status: "ready", value } }),
      (cause) =>
        current && setHeld({ request, result: { status: "error", error: describeError(cause) } }),
    );
    return () => {
      current = false;
    };
  }, [sync, request, read]);
  const result: RemoteResult<A> = !sync
    ? { status: "ready", value: offline }
    : held?.request === request
      ? held.result
      : { status: "loading" };
  return { result, reload: () => setRound((n) => n + 1) };
};

const noBalances: PlayerBalances = { pairs: [] };
const readBalances = (sync: RecordingSync) => sync.balances();

/** What the device's players and the people they've shared a table with owe each other. */
export const usePlayerBalances = () => useRemote(readBalances, "balances", noBalances);

/**
 * Everything between this device's player and `playerId`, fetched again as this device's payments
 * sync. Null when there's nobody to settle with: the device never synced.
 */
export const usePlayerPair = (playerId: PlayerId) => {
  const store = useRecordingStore();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const read = useCallback((sync: RecordingSync) => sync.pair(playerId), [playerId]);
  const remote = useRemote<PairHistory | null>(
    read,
    `${playerId}:${snapshot.state?.sync?.synced.length ?? 0}`,
    null,
  );
  return { ...remote, state: snapshot.state };
};

/** Payments on this device the server hasn't confirmed, optionally with one counterparty. */
export const usePendingPayments = (counterpartyId?: PlayerId) => {
  const store = useRecordingStore();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return useMemo(
    () => pendingPayments(snapshot.state, counterpartyId),
    [snapshot.state, counterpartyId],
  );
};

/** The sync line and refused payments, with the same record-again and discard as play. */
export const usePaymentSync = () => {
  const store = useRecordingStore();
  const sync = use(RecordingSyncContext);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const status = useSyncExternalStore(sync?.subscribe ?? noSubscription, sync?.getStatus ?? idle);
  const view = useMemo(() => paymentSyncView(snapshot.state, status), [snapshot.state, status]);
  const [error, setError] = useState<string | null>(null);
  const resolve =
    (action: "recordAgain" | "discard") => async (operationId: RecordingOperationId) => {
      if (!sync) return;
      setError(null);
      try {
        await sync[action](operationId);
      } catch (cause) {
        setError(describeRecordingError(cause));
      }
    };
  return { ...view, error, recordAgain: resolve("recordAgain"), discard: resolve("discard") };
};
