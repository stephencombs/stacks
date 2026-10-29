import { useAtomSet } from "@effect/atom-react";
import type { SessionId } from "@stacks/contracts";
import * as Cause from "effect/Cause";
import * as Exit from "effect/Exit";
import type * as Atom from "effect/reactivity/Atom";
import {
  createContext,
  use,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { LEDGER_KEYS, type Stacks } from "./api.ts";
import { describeError } from "./errors.ts";
import { makeOutbox, type Outbox, type OutboxStorage } from "./outbox.ts";

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
export function useAction<Arg, A, E>(mutation: Atom.AtomResultFn<Arg, A, E>) {
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
  const add = useAtomSet(stacks.Client.mutation("ledger", "addEntry"), { mode: "promiseExit" });
  const [outbox] = useState(() =>
    makeOutbox(storage, async ({ sessionId, entry }) => {
      const exit = await add({
        params: { sessionId },
        payload: entry,
        reactivityKeys: LEDGER_KEYS,
      });
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
