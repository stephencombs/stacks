import { useAtomValue } from "@effect/atom-react";
import { CommonActions, useNavigation } from "@react-navigation/native";
import { GroupId, TripId, type Trip } from "@stacks/contracts";
import { tripInScope } from "@stacks/client-runtime/trip";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import {
  createContext,
  use,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import { resolveScope, withStartedTrip, type Scope } from "@stacks/client-runtime/scope";
import { Loaded, useLastTrip, useStacks } from "./stacks";

type Picked = { readonly groupId: GroupId; readonly whileTrip: TripId | null };

const PickedContext = createContext<Picked | null>(null);
const SetPickedContext = createContext<(picked: Picked | null) => void>(() => {});

const StartedContext = createContext<readonly [Trip | null, Dispatch<SetStateAction<Trip | null>>]>(
  [null, () => {}],
);

export function ScopeProvider({ children }: { children: ReactNode }) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [started, setStarted] = useState<Trip | null>(null);
  const startedValue = useMemo(() => [started, setStarted] as const, [started]);

  return (
    <SetPickedContext value={setPicked}>
      <StartedContext value={startedValue}>
        <PickedContext value={picked}>{children}</PickedContext>
      </StartedContext>
    </SetPickedContext>
  );
}

/**
 * The trip in focus and its group, shared by every place. The trip is remembered on the device
 * with the last-trip store; `scope` is undefined until your groups load, and null with no groups.
 */
export function useScope() {
  const stacks = useStacks();
  const groups = useAtomValue(stacks.groups);
  const { lastTripId, setLastTripId } = useLastTrip();
  const picked = use(PickedContext);
  const setPicked = use(SetPickedContext);
  const groupId = picked?.whileTrip === lastTripId ? picked.groupId : null;
  const [started, setStarted] = use(StartedContext);
  const loaded = AsyncResult.getOrElse(groups, () => null);
  const list = loaded && withStartedTrip(loaded, started);

  return {
    scope: list ? resolveScope(list, lastTripId, groupId) : undefined,
    startTrip: (trip: Trip) => {
      setStarted(trip);
      setPicked(null);
      setLastTripId(trip.id);
    },
    setTrip: (tripId: TripId) => {
      setPicked(null);
      setLastTripId(tripId);
    },
    setGroup: (id: GroupId) => {
      const trip = tripInScope(list?.find((item) => item.group.id === id)?.trips ?? [], lastTripId);

      if (trip) {
        setPicked(null);
        setLastTripId(trip.id);
      } else setPicked({ groupId: id, whileTrip: lastTripId });
    },
    forgetTrip: (id: GroupId, tripId: TripId) => {
      setStarted((pending) => (pending?.id === tripId ? null : pending));
      setPicked({ groupId: id, whileTrip: null });
      setLastTripId(null);
    },
  };
}

/**
 * A screen opened at an address that names a trip or group puts it in scope before it paints.
 * Moving around inside the app sets the scope directly, so only links carry these params.
 */
export function useLinkedScope(
  link: { tripId?: string | undefined; groupId?: string | undefined } | undefined,
) {
  const { scope, setTrip, setGroup } = useScope();
  const tripId = link?.tripId;
  const groupId = link?.groupId;

  const apply = useEffectEvent((trip: string | undefined, group: string | undefined) => {
    if (trip) {
      if (trip !== scope?.trip?.id) setTrip(TripId.make(trip));
    } else if (group && group !== scope?.item.group.id) setGroup(GroupId.make(group));
  });

  useLayoutEffect(() => apply(tripId, groupId), [tripId, groupId]);
}

/**
 * A place's address names what's in scope. A link still sets the scope, as `useLinkedScope`
 * does; after that the address follows the scope, so a place opened from the tab bar or switched
 * from the scope sheet keeps an address that opens it again.
 */
export function usePlaceAddress(
  link: { tripId?: string | undefined; groupId?: string | undefined } | undefined,
  key: "tripId" | "groupId",
) {
  useLinkedScope(link);
  const navigation = useNavigation();
  const { scope } = useScope();
  const id = key === "tripId" ? scope?.trip?.id : scope?.item.group.id;
  const named = link?.[key];
  const last = useRef(id);
  useEffect(() => {
    const moved = last.current !== undefined && last.current !== id;
    last.current = id;

    if (id === undefined || id === named || (named !== undefined && !moved)) return;
    navigation.dispatch(CommonActions.setParams({ [key]: id }));
  }, [id, named, key, navigation]);
}

/** Renders the scope once your groups have loaded; nothing if you're in none. */
export function ScopeLoaded({
  skeleton,
  renderError,
  children,
}: {
  skeleton: ReactNode;
  renderError?: (message: string) => ReactNode;
  children: (scope: Scope) => ReactNode;
}) {
  const stacks = useStacks();
  const { scope } = useScope();

  return (
    <Loaded query={stacks.groups} skeleton={skeleton} renderError={renderError}>
      {() => (scope ? children(scope) : null)}
    </Loaded>
  );
}
