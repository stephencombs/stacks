import { getToken } from "@clerk/react";
import { RegistryProvider, useAtomValue } from "@effect/atom-react";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import type * as Atom from "effect/reactivity/Atom";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { makeStacksClient } from "@stacks/client-runtime/api";
import { describeError } from "@stacks/client-runtime/errors";
import type { OutboxStorage } from "@stacks/client-runtime/outbox";
import {
  OutboxProvider,
  StacksContext,
  useAction,
  useOutbox,
  usePending,
  useUnsaved,
  useStacks,
} from "@stacks/client-runtime/react";
import { useState, type ReactNode } from "react";

import { FormError } from "~/components/ui/Field";
import { Skeleton } from "~/components/ui/Surface";

/**
 * One API client and atom registry per signed-in user. Remounting it with a new `key` on
 * sign-in drops every cached query from the previous user.
 */
export function StacksProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [stacks] = useState(() =>
    makeStacksClient({
      baseUrl: import.meta.env.VITE_API_URL ?? "",
      getToken: () => getToken(),
    }),
  );
  const [storage] = useState(() => outboxStorage(userId));
  return (
    <StacksContext value={stacks}>
      <RegistryProvider>
        <OutboxProvider storage={storage} wake={wakeOutbox}>
          {children}
        </OutboxProvider>
      </RegistryProvider>
    </StacksContext>
  );
}

/** Entries waiting for signal, per person signed in on this browser. */
const outboxStorage = (userId: string): OutboxStorage => ({
  load: () => localStorage.getItem(`stacks-outbox-${userId}`),
  save: (value) => localStorage.setItem(`stacks-outbox-${userId}`, value),
});

/** Retry as soon as the browser is back online or the tab comes back. */
const wakeOutbox = (flush: () => void) => {
  const visible = () => (document.visibilityState === "visible" ? flush() : undefined);
  window.addEventListener("online", flush);
  document.addEventListener("visibilitychange", visible);
  return () => {
    window.removeEventListener("online", flush);
    document.removeEventListener("visibilitychange", visible);
  };
};

export { useAction, useOutbox, usePending, useStacks, useUnsaved };

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
