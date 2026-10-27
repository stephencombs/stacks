import { getClerkInstance } from "@clerk/expo";
import { RegistryProvider, useAtomValue } from "@effect/atom-react";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import type * as Atom from "effect/reactivity/Atom";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { makeStacksClient } from "@stacks/client-runtime/api";
import { describeError } from "@stacks/client-runtime/errors";
import { StacksContext, useAction, useStacks } from "@stacks/client-runtime/react";
import { useState, type ReactNode } from "react";

import { FormError } from "../components/ui/Field";
import { Skeleton } from "../components/ui/Surface";
import { apiUrl, clerkPublishableKey } from "./config";

/**
 * One API client and atom registry per signed-in user. Remounting it with a new `key` on
 * sign-in drops every cached query from the previous user.
 */
export function StacksProvider({ children }: { children: ReactNode }) {
  const [stacks] = useState(() =>
    makeStacksClient({
      baseUrl: apiUrl,
      getToken: async () =>
        (await getClerkInstance({ publishableKey: clerkPublishableKey }).session?.getToken()) ??
        null,
    }),
  );
  return (
    <StacksContext value={stacks}>
      <RegistryProvider>{children}</RegistryProvider>
    </StacksContext>
  );
}

export { useAction, useStacks };

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
    onInitial: () => skeleton ?? <Skeleton className="h-32" />,
    // A failed refresh keeps showing what was there before.
    onFailure: (failure) =>
      Option.match(failure.previousSuccess, {
        onSome: (previous) => children(previous.value),
        onNone: () => <FormError>{describeError(Cause.squash(failure.cause))}</FormError>,
      }),
    onSuccess: (success) => children(success.value),
  });
}
