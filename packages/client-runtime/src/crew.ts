import type {
  CrewActivityItem,
  GroupListItem,
  PlayerId,
  SessionId,
  Trip,
  TripId,
  VisitId,
} from "@stacks/contracts";
import * as DateTime from "effect/DateTime";

import { tripIsLive } from "./scope.ts";

const newestFirst = (a: Trip, b: Trip) =>
  DateTime.toEpochMillis(b.startedAt) - DateTime.toEpochMillis(a.startedAt);

/**
 * The trip Crew pins on top: one still going in any of your groups, a trip with someone at a
 * table first, else the newest. Null once every trip has ended.
 */
export const pinnedTrip = (
  groups: ReadonlyArray<GroupListItem>,
): { readonly item: GroupListItem; readonly trip: Trip } | null => {
  const going = groups
    .flatMap((item) =>
      item.trips.filter((trip) => trip.endedAt === null).map((trip) => ({ item, trip })),
    )
    .toSorted(
      (a, b) =>
        Number(tripIsLive(b.item, b.trip)) - Number(tripIsLive(a.item, a.trip)) ||
        newestFirst(a.trip, b.trip),
    );
  return going[0] ?? null;
};

/**
 * The feed as Crew shows it. Your own live play is left out: it has the LiveBar, and a live
 * session never shows as a list on a tab.
 */
export const crewFeed = (
  items: ReadonlyArray<CrewActivityItem>,
  groups: ReadonlyArray<Pick<GroupListItem, "group" | "myPlayerId">>,
) => {
  const mine = new Map(groups.map((item) => [item.group.id, item.myPlayerId]));
  return items.filter((item) => {
    if (item.kind !== "session_live" && item.kind !== "table_live") return true;
    const me = mine.get(item.group.id);
    return !item.players.some((player) => player.playerId === me);
  });
};

export type ActivityTarget =
  | { readonly kind: "session"; readonly sessionId: SessionId }
  | { readonly kind: "visit"; readonly visitId: VisitId }
  | { readonly kind: "trip"; readonly tripId: TripId };

/** Where a row opens: its session, your visit at its table, or, for a table you didn't play, its trip. */
export const activityTarget = (item: CrewActivityItem): ActivityTarget => {
  switch (item.kind) {
    case "session_live":
    case "session_finished":
      return { kind: "session", sessionId: item.sessionId };
    case "table_live":
    case "table_finished":
      return item.myVisitId
        ? { kind: "visit", visitId: item.myVisitId }
        : { kind: "trip", tripId: item.trip.id };
    case "trip_started":
      return { kind: "trip", tripId: item.trip.id };
  }
};

/** What a group has going, for the groups list: a live trip, else when its last trip started. */
export const groupHappening = (
  item: GroupListItem,
):
  | { readonly kind: "live"; readonly trip: Trip | undefined }
  | { readonly kind: "started"; readonly trip: Trip }
  | { readonly kind: "none" } => {
  const latest = item.trips.toSorted(newestFirst)[0];
  if (item.liveSessionCount > 0)
    return {
      kind: "live",
      trip:
        item.trips.find((trip) => tripIsLive(item, trip)) ??
        item.trips.find((trip) => trip.id === item.currentTripId),
    };
  return latest ? { kind: "started", trip: latest } : { kind: "none" };
};

/** "Ana, Ben and Cy", or "Ana, Ben and 3 others" past three. */
export const nameList = (names: ReadonlyArray<string>) => {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= 3) return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} others`;
};

/** Group members at the trip's live sessions and tables, each once, in the order they sat down. */
export const livePlayerIds = (
  plays: ReadonlyArray<{ readonly live: boolean; readonly playing: ReadonlyArray<PlayerId> }>,
) => [...new Set(plays.filter((play) => play.live).flatMap((play) => play.playing))];
