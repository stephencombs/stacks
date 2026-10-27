import { useAtomSet } from "@effect/atom-react";
import * as Cause from "effect/Cause";
import * as Exit from "effect/Exit";
import type * as Atom from "effect/reactivity/Atom";
import { createContext, use, useState } from "react";

import { LEDGER_KEYS, type Stacks } from "./api.ts";
import { describeError } from "./errors.ts";

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
  const execute = async (arg: Omit<Arg, "reactivityKeys">) => {
    setState({ pending: true, error: null });
    const exit = await run({ ...arg, reactivityKeys: LEDGER_KEYS } as Arg);
    const error = Exit.isFailure(exit) ? describeError(Cause.squash(exit.cause)) : null;
    setState({ pending: false, error });
    return Exit.isSuccess(exit) ? exit.value : null;
  };
  return { run: execute, ...state, clearError: () => setState((s) => ({ ...s, error: null })) };
}
