import type { GroupId, GroupListItem, Trip, TripId } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";

import { tripInScope } from "./trip.ts";

/** The group in focus and its trip, which is missing only while the group has none. */
export type Scope = { readonly item: GroupListItem; readonly trip: Trip | undefined };

/**
 * What's in scope: a group picked on its own (one with no trips, or one whose trip isn't known
 * yet), else the remembered trip and its group, else the newest trip still going, else any trip.
 * `null` means you're in no group at all.
 */
export const resolveScope = (
  groups: ReadonlyArray<GroupListItem>,
  tripId: TripId | null,
  groupId: GroupId | null,
): Scope | null => {
  const holding = groups.find((item) => item.trips.some((trip) => trip.id === tripId));
  const picked = groups.find((item) => item.group.id === groupId);
  if (picked && picked !== holding) return { item: picked, trip: tripInScope(picked.trips, null) };
  if (holding) return { item: holding, trip: holding.trips.find((trip) => trip.id === tripId) };
  const going = groups
    .flatMap((item) =>
      item.trips.filter((trip) => trip.endedAt === null).map((trip) => ({ item, trip })),
    )
    .toSorted(
      (a, b) => DateTime.toEpochMillis(b.trip.startedAt) - DateTime.toEpochMillis(a.trip.startedAt),
    )[0];
  if (going) return going;
  const item = groups.find((group) => group.trips.length > 0) ?? groups[0];
  return item ? { item, trip: item.trips[0] } : null;
};

/**
 * Whether a trip has a table going: yours, or any while it's the group's only trip still going.
 * Groups count live sessions, not which trip they're in, so with two trips going only yours shows.
 */
export const tripIsLive = (
  item: Pick<GroupListItem, "mySession" | "liveSessionCount" | "trips">,
  trip: Pick<Trip, "id" | "endedAt">,
) =>
  item.mySession?.tripId === trip.id ||
  (trip.endedAt === null &&
    item.liveSessionCount > 0 &&
    item.trips.filter((other) => other.endedAt === null).length === 1);
