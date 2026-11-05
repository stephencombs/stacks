import type { GroupDetail, TripDetail, TripId } from "@stacks/contracts";
import { getClerkInstance } from "@clerk/expo";
import { RegistryProvider, useAtomValue } from "@effect/atom-react";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import type * as Atom from "effect/reactivity/Atom";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { makeStacksClient } from "@stacks/client-runtime/api";
import { describeError } from "@stacks/client-runtime/errors";
import {
  OutboxProvider,
  LastTripProvider,
  StacksContext,
  TelemetryContext,
  useAction,
  useOutbox,
  usePending,
  useUnsaved,
  useStacks,
  useLastTrip,
  useRevalidate,
} from "@stacks/client-runtime/react";
import { CACHE_MS } from "@stacks/client-runtime/freshness";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";

import { FormError } from "../components/ui/Field";
import { Skeleton } from "../components/ui/Surface";
import { apiUrl, clerkPublishableKey } from "./config";
import { markStartup } from "./diagnostics";
import { outboxStorage, wakeOutbox } from "./outbox";
import { captureTestEvent } from "./telemetry";
import { lastTripStorage } from "./tripStorage";

/**
 * One API client and atom registry per signed-in user. Remounting it with a new `key` on
 * sign-in drops every cached query from the previous user.
 */
export function StacksProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [stacks] = useState(() =>
    makeStacksClient({
      baseUrl: apiUrl,
      getToken: async () =>
        (await getClerkInstance({ publishableKey: clerkPublishableKey }).session?.getToken()) ??
        null,
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
              <RefusalHaptic />
              {children}
            </OutboxProvider>
          </LastTripProvider>
        </RegistryProvider>
      </StacksContext>
    </TelemetryContext>
  );
}

export { useAction, useLastTrip, useOutbox, usePending, useStacks, useUnsaved };

/** Renders a query: a skeleton while it first loads, an explanation if it fails. */
/** The app coming back to the foreground: shown data may be stale. */
const onWake = (revalidate: () => void) => {
  const subscription = AppState.addEventListener("change", (state) =>
    state === "active" ? revalidate() : undefined,
  );
  return () => subscription.remove();
};

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
  const settled = !AsyncResult.isInitial(result);
  useEffect(() => {
    if (settled) markStartup("query_settled");
  }, [settled]);
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

/** A buzz the moment the server refuses something logged here, so it's noticed in a pocket. */
function RefusalHaptic() {
  const outbox = useOutbox();
  const refused = useRef(new Set<string>());
  useEffect(
    () =>
      outbox.subscribe(() => {
        const now = outbox.pending().filter((p) => p.failed !== null);
        if (now.some((p) => !refused.current.has(p.entry.id)) && Platform.OS !== "web")
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        refused.current = new Set(now.map((p) => p.entry.id));
      }),
    [outbox],
  );
  return null;
}

/**
 * Waits for a query without depending on it: renders once it has answered either way, so a screen
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
 * A trip screen's data: the trip, its group, and your limits for it, behind one skeleton. The group
 * and limits requests start alongside the trip's when your groups already say which group it is,
 * and the screen paints once with everything it shows.
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
