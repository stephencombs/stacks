import { useAtomValue } from "@effect/atom-react";
import { GroupId, TripId } from "@stacks/contracts";
import { tripInScope } from "@stacks/client-runtime/trip";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import {
  createContext,
  use,
  useEffectEvent,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";

import { resolveScope, type Scope } from "./resolveScope";
import { Loaded, useLastTrip, useStacks } from "./stacks";

/**
 * A group picked without a trip, such as one that has none yet. It holds only until the
 * remembered trip changes, so opening any trip or session takes the scope back.
 */
type Picked = { readonly groupId: GroupId; readonly whileTrip: TripId | null };

const PickedContext = createContext<Picked | null>(null);
const SetPickedContext = createContext<(picked: Picked | null) => void>(() => {});

export function ScopeProvider({ children }: { children: ReactNode }) {
  const [picked, setPicked] = useState<Picked | null>(null);
  return (
    <SetPickedContext value={setPicked}>
      <PickedContext value={picked}>{children}</PickedContext>
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
  const list = AsyncResult.getOrElse(groups, () => null);
  return {
    scope: list ? resolveScope(list, lastTripId, groupId) : undefined,
    setTrip: (tripId: TripId) => {
      setPicked(null);
      setLastTripId(tripId);
    },
    /** Keeps the trip if it's already in this group; otherwise its live or newest one. */
    setGroup: (id: GroupId) => {
      const trip = tripInScope(list?.find((item) => item.group.id === id)?.trips ?? [], lastTripId);
      if (trip) {
        setPicked(null);
        setLastTripId(trip.id);
      } else setPicked({ groupId: id, whileTrip: lastTripId });
    },
    /** After the trip in scope is deleted: its group's next trip, or the group alone. */
    forgetTrip: (id: GroupId) => {
      setPicked({ groupId: id, whileTrip: null });
      setLastTripId(null);
    },
  };
}

/** Whether there's a trip for Sessions, Board and Settle up to show. Assumed while groups load. */
export const useScopeHasTrip = () => {
  const { scope } = useScope();
  return scope === undefined || scope === null || scope.trip !== undefined;
};

/**
 * A screen opened at an address that names a trip or group puts it in scope before it paints.
 * Moving around inside the app sets the scope directly, so only links carry these params.
 */
export function useLinkedScope(
  link: { tripId?: string | undefined; groupId?: string | undefined } | undefined,
) {
  const { setTrip, setGroup } = useScope();
  const tripId = link?.tripId;
  const groupId = link?.groupId;
  const apply = useEffectEvent((trip: string | undefined, group: string | undefined) => {
    if (trip) setTrip(TripId.make(trip));
    else if (group) setGroup(GroupId.make(group));
  });
  useLayoutEffect(() => apply(tripId, groupId), [tripId, groupId]);
}

/** Renders the scope once your groups have loaded; nothing if you're in none. */
export function ScopeLoaded({
  skeleton,
  children,
}: {
  skeleton: ReactNode;
  children: (scope: Scope) => ReactNode;
}) {
  const stacks = useStacks();
  const { scope } = useScope();
  return (
    <Loaded query={stacks.groups} skeleton={skeleton}>
      {() => (scope ? children(scope) : null)}
    </Loaded>
  );
}
