import type { GroupDetail, TripDetail, TripId } from "@stacks/contracts";
import { getClerkInstance } from "@clerk/expo";
import { useAtomValue } from "@effect/atom-react";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import type * as Atom from "effect/reactivity/Atom";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { makeRecordingTransport, makeStacksClient } from "@stacks/client-runtime/api";
import { RecordingSyncRoot } from "@stacks/client-runtime/recordingReact";
import { describeError } from "@stacks/client-runtime/errors";
import {
  SignedInRoot,
  SignedInScope,
  TelemetryContext,
  makeSignedIn,
  useAction,
  useOutbox,
  usePending,
  useUnsaved,
  useStacks,
  useLastTrip,
  useRevalidate,
  useSignedInOutbox,
} from "@stacks/client-runtime/react";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, type ReactNode } from "react";
import { AppState, Platform } from "react-native";

import { FormError } from "../components/ui/Field";
import { Skeleton } from "../components/ui/Surface";
import { useAccount } from "./account";
import { actorKeys } from "./actorKeys";
import { apiUrl, clerkPublishableKey } from "./config";
import { markStartup } from "./diagnostics";
import { outboxStorage, wakeOutbox } from "./outbox";
import { captureTestEvent } from "./telemetry";
import { lastTripStorage } from "./tripStorage";

/**
 * Around the navigation: whoever is signed in keeps one API client, query cache and outbox while
 * they move between their own play and their groups. Signed out, it holds nothing.
 */
export function SignedInProvider({ children }: { children: ReactNode }) {
  const account = useAccount();
  const userId = (account.available && account.isSignedIn && account.userId) || null;
  return (
    <SignedInRoot userId={userId} make={signIn} wake={wakeOutbox}>
      <RefusalHaptic />
      <RecordingSyncRoot
        userId={userId}
        connect={connectRecording}
        keys={actorKeys}
        wake={wakeOutbox}
      >
        {children}
      </RecordingSyncRoot>
    </SignedInRoot>
  );
}

const api = {
  baseUrl: apiUrl,
  getToken: async () =>
    (await getClerkInstance({ publishableKey: clerkPublishableKey }).session?.getToken()) ?? null,
};

const connectRecording = () => makeRecordingTransport(api);

const signIn = (userId: string) =>
  makeSignedIn({
    stacks: makeStacksClient(api),
    outbox: outboxStorage(userId),
    lastTrip: lastTripStorage(userId),
    capture: captureTestEvent,
  });

/** Account screens: the signed-in user's client and cache, under a `key` per user. */
export function StacksProvider({ children }: { children: ReactNode }) {
  return (
    <TelemetryContext value={captureTestEvent}>
      <SignedInScope>{children}</SignedInScope>
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
  renderError,
  children,
}: {
  query: Atom.Atom<AsyncResult.AsyncResult<A, E>>;
  skeleton?: ReactNode;
  renderError?: (message: string) => ReactNode;
  children: (value: A) => ReactNode;
}) {
  const result = useAtomValue(query);
  useRevalidate(query, result, onWake);
  const settled = !AsyncResult.isInitial(result);
  // Personal play opens first, so the first account query starts when someone opens a group or
  // signs in. Its start splits their wait from the query's own time.
  useEffect(() => markStartup("query_started"), []);
  useEffect(() => {
    if (settled) markStartup("query_settled");
  }, [settled]);
  return AsyncResult.match(result, {
    onInitial: () => skeleton ?? <Skeleton className="h-32" />,
    // A failed refresh keeps showing what was there before.
    onFailure: (failure) =>
      Option.match(failure.previousSuccess, {
        onSome: (previous) => children(previous.value),
        onNone: () => {
          const message = describeError(Cause.squash(failure.cause));
          return renderError ? renderError(message) : <FormError>{message}</FormError>;
        },
      }),
    onSuccess: (success) => children(success.value),
  });
}

/** A buzz the moment the server refuses something logged here, so it's noticed in a pocket. */
function RefusalHaptic() {
  const outbox = useSignedInOutbox();
  const refused = useRef(new Set<string>());
  useEffect(
    () =>
      outbox?.subscribe(() => {
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
 * A trip screen's data: the trip and its group, behind one skeleton. The group request starts
 * alongside the trip's when your groups already say which group it is, and the screen paints once
 * with everything it shows.
 */
export function TripLoaded({
  tripId,
  skeleton,
  renderError,
  children,
}: {
  tripId: TripId;
  skeleton: ReactNode;
  renderError?: (message: string) => ReactNode;
  children: (trip: TripDetail, group: GroupDetail) => ReactNode;
}) {
  const stacks = useStacks();
  const groups = AsyncResult.getOrElse(useAtomValue(stacks.groups), () => []);
  const groupId = groups.find((item) => item.trips.some((trip) => trip.id === tripId))?.group.id;
  return (
    <>
      {groupId ? <Prefetch query={stacks.group(groupId)} /> : null}
      <Loaded query={stacks.trip(tripId)} skeleton={skeleton} renderError={renderError}>
        {(trip) => (
          <Loaded
            query={stacks.group(trip.trip.groupId)}
            skeleton={skeleton}
            renderError={renderError}
          >
            {(group) => children(trip, group)}
          </Loaded>
        )}
      </Loaded>
    </>
  );
}
