import { getToken } from "@clerk/react";
import { RegistryProvider, useAtomSet, useAtomValue } from "@effect/atom-react";
import * as Cause from "effect/Cause";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import type * as Atom from "effect/reactivity/Atom";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { LEDGER_KEYS, makeStacksClient, type Stacks } from "@stacks/client-runtime/api";
import { describeError } from "@stacks/client-runtime/errors";
import { createContext, use, useState, type ReactNode } from "react";

import { FormError } from "~/components/ui/Field";
import { Skeleton } from "~/components/ui/Surface";

const StacksContext = createContext<Stacks | null>(null);

/**
 * One API client and atom registry per signed-in user. Remounting it with a new `key` on
 * sign-in drops every cached query from the previous user.
 */
export function StacksProvider({ children }: { children: ReactNode }) {
  const [stacks] = useState(() =>
    makeStacksClient({
      baseUrl: import.meta.env.VITE_API_URL ?? "",
      getToken: () => getToken(),
    }),
  );
  return (
    <StacksContext value={stacks}>
      <RegistryProvider>{children}</RegistryProvider>
    </StacksContext>
  );
}

export const useStacks = () => {
  const stacks = use(StacksContext);
  if (!stacks) throw new Error("useStacks needs a StacksProvider above it");
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

/** Renders a query: a skeleton while it first loads, an explanation if it fails. */
export function Loaded<A, E>({
  query,
  skeleton,
  children,
}: {
  query: Atom.Atom<AsyncResult.AsyncResult<A, E>>;
  skeleton?: ReactNode;
  children: (value: A) => ReactNode;
}) {
  const result = useAtomValue(query);
  return AsyncResult.match(result, {
    onInitial: () => skeleton ?? <Skeleton className="h-32 w-full" />,
    // A failed refresh keeps showing what was there before.
    onFailure: (failure) =>
      Option.match(failure.previousSuccess, {
        onSome: (previous) => children(previous.value),
        onNone: () => <FormError>{describeError(Cause.squash(failure.cause))}</FormError>,
      }),
    onSuccess: (success) => children(success.value),
  });
}
