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
  LastTripProvider,
  OutboxProvider,
  StacksContext,
  TelemetryContext,
  useAction,
  useLastTrip,
  useOutbox,
  usePending,
  useRememberTrip,
  useRevalidate,
  useUnsaved,
  useStacks,
} from "@stacks/client-runtime/react";
import { CACHE_MS } from "@stacks/client-runtime/freshness";
import type { LastTripStorage } from "@stacks/client-runtime/trip";
import type { GroupDetail, TripDetail, TripId } from "@stacks/contracts";
import { useState, type ReactNode } from "react";

import { FormError } from "~/components/ui/Field";
import { Skeleton } from "~/components/ui/Surface";
import { captureTestEvent } from "./telemetry";

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
  const [tripStorage] = useState(() => lastTripStorage(userId));
  return (
    <TelemetryContext value={captureTestEvent}>
      <StacksContext value={stacks}>
        <RegistryProvider defaultIdleTTL={CACHE_MS}>
          <LastTripProvider storage={tripStorage}>
            <OutboxProvider storage={storage} wake={wakeOutbox}>
              {children}
            </OutboxProvider>
          </LastTripProvider>
        </RegistryProvider>
      </StacksContext>
    </TelemetryContext>
  );
}

/** Entries waiting for signal, per person signed in on this browser. */
const outboxStorage = (userId: string): OutboxStorage => ({
  load: () => localStorage.getItem(`stacks-outbox-${userId}`),
  save: (value) => localStorage.setItem(`stacks-outbox-${userId}`, value),
});

const lastTripStorage = (userId: string): LastTripStorage => ({
  load: () => localStorage.getItem(`stacks-last-trip-${userId}`),
  save: (value) => {
    const key = `stacks-last-trip-${userId}`;
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  },
});

/** The tab coming back into view or the network returning: shown data may be stale. */
const onWake = (revalidate: () => void) => {
  const visible = () => (document.visibilityState === "visible" ? revalidate() : undefined);
  window.addEventListener("focus", revalidate);
  window.addEventListener("online", revalidate);
  document.addEventListener("visibilitychange", visible);
  return () => {
    window.removeEventListener("focus", revalidate);
    window.removeEventListener("online", revalidate);
    document.removeEventListener("visibilitychange", visible);
  };
};

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

export { useAction, useLastTrip, useOutbox, usePending, useRememberTrip, useStacks, useUnsaved };

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
  useRevalidate(query, result, onWake);
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

/**
 * Waits for a query without depending on it: renders once it has answered either way, so a page
 * can hold its first paint until a side query is in, and still render if that query fails.
 */
export function Settled<A, E>({
  query,
  skeleton,
  children,
}: {
  query: Atom.Atom<AsyncResult.AsyncResult<A, E>>;
  skeleton: ReactNode;
  children: ReactNode;
}) {
  return AsyncResult.isInitial(useAtomValue(query)) ? skeleton : children;
}

/** Starts a query early, so whatever reads it later finds it loading or loaded. */
export function Prefetch<A, E>({ query }: { query: Atom.Atom<AsyncResult.AsyncResult<A, E>> }) {
  useAtomValue(query);
  return null;
}

/**
 * A trip page's data: the trip, its group, and your limits for it, behind one skeleton. The group
 * and limits requests start alongside the trip's when your groups already say which group it is,
 * rather than after it, and the page paints once with everything it shows.
 */
export function TripLoaded({
  tripId,
  skeleton,
  children,
}: {
  tripId: TripId;
  skeleton: ReactNode;
  children: (trip: TripDetail, group: GroupDetail) => ReactNode;
}) {
  const stacks = useStacks();
  const groups = AsyncResult.getOrElse(useAtomValue(stacks.groups), () => []);
  const groupId = groups.find((item) => item.trips.some((trip) => trip.id === tripId))?.group.id;
  return (
    <>
      {groupId ? <Prefetch query={stacks.group(groupId)} /> : null}
      <Prefetch query={stacks.limits(tripId)} />
      <Loaded query={stacks.trip(tripId)} skeleton={skeleton}>
        {(trip) => (
          <Loaded query={stacks.group(trip.trip.groupId)} skeleton={skeleton}>
            {(group) => (
              <Settled query={stacks.limits(tripId)} skeleton={skeleton}>
                {children(trip, group)}
              </Settled>
            )}
          </Loaded>
        )}
      </Loaded>
    </>
  );
}
