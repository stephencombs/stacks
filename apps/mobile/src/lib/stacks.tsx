import type { GroupDetail, GroupId, TripDetail, TripId } from "@stacks/contracts";
import { getClerkInstance } from "@clerk/expo";
import { useAtomValue } from "@effect/atom-react";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import type * as Atom from "effect/reactivity/Atom";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import {
  makeRecordingTransport,
  makeScopeWatchable,
  makeStacksClient,
} from "@stacks/client-runtime/api";
import { RecordingSyncRoot } from "@stacks/client-runtime/recordingReact";
import { describeError } from "@stacks/client-runtime/errors";
import {
  SignedInRoot,
  SignedInScope,
  TelemetryContext,
  makeSignedIn,
  useAction,
  useStacks,
  useLastTrip,
  useStatsCopies,
  useGroupStats as useGroupStatsWith,
  useRevalidate,
  useSignedInOutbox,
} from "@stacks/client-runtime/react";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, type ReactNode } from "react";
import { AppState } from "react-native";

import { FormError } from "../components/ui/Field";
import { Skeleton } from "../components/ui/Surface";
import { useAccount } from "./account";
import { actorKeys } from "./actorKeys";
import { apiUrl, clerkPublishableKey } from "./config";
import { markStartup } from "./diagnostics";
import { outboxStorage, wakeOutbox } from "./outbox";
import { installOrigin } from "./origin";
import { createHub, ScopeHubProvider } from "./scopeHub";
import { captureTestEvent } from "./telemetry";
import { lastTripStorage, statsCopyStorage } from "./tripStorage";

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
        <ScopeHubProvider make={makeDeviceHub}>{children}</ScopeHubProvider>
      </RecordingSyncRoot>
    </SignedInRoot>
  );
}

const api = {
  baseUrl: apiUrl,
  getToken: async () =>
    (await getClerkInstance({ publishableKey: clerkPublishableKey }).session?.getToken()) ?? null,
  origin: installOrigin,
};

const bearer = async () => {
  const token = await api.getToken();

  return token ? `Bearer ${token}` : null;
};

const asDevice = async () => {
  const signedIn = await bearer().catch(() => null);

  if (signedIn) return signedIn;
  const actor = await actorKeys.load();

  return actor ? `Actor ${actor.actorId}.${actor.secret}` : null;
};

const makeDeviceHub = () =>
  createHub({
    authorization: asDevice,
    watchable: makeScopeWatchable({ baseUrl: apiUrl, authorization: asDevice }),
  });

const connectRecording = () => makeRecordingTransport(api);

const signIn = (userId: string) =>
  makeSignedIn({
    stacks: makeStacksClient(api),
    outbox: outboxStorage(userId),
    lastTrip: lastTripStorage(userId),
    statsCopies: statsCopyStorage(userId),
    scopeHub: createHub({
      authorization: bearer,
      watchable: makeScopeWatchable({ baseUrl: apiUrl, authorization: bearer }),
    }),
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

export { useAction, useLastTrip, useStacks, useStatsCopies };

const onWake = (revalidate: () => void) => {
  const subscription = AppState.addEventListener("change", (state) =>
    state === "active" ? revalidate() : undefined,
  );

  return () => subscription.remove();
};

/** A group's stats, fresh while shown, and the phone's last copy of them offline. */
export const useGroupStats = (groupId: GroupId) => useGroupStatsWith(groupId, onWake);

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
  useEffect(() => {
    if (settled) markStartup("query_settled");
  }, [settled]);

  return AsyncResult.match(result, {
    onInitial: () => skeleton ?? <Skeleton className="h-32" />,
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

function RefusalHaptic() {
  const outbox = useSignedInOutbox();
  const refused = useRef(new Set<string>());
  useEffect(
    () =>
      outbox?.subscribe(() => {
        const now = outbox.pending().filter((p) => p.failed !== null);

        if (now.some((p) => !refused.current.has(p.entry.id)))
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        refused.current = new Set(now.map((p) => p.entry.id));
      }),
    [outbox],
  );

  return null;
}

function Prefetch<A, E>({ query }: { query: Atom.Atom<AsyncResult.AsyncResult<A, E>> }) {
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
