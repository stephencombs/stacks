import { GroupDetail, GroupId, GroupStats, TripId, type GroupListItem } from "@stacks/contracts";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Schema from "effect/Schema";

import { describeError, isRetryable } from "./errors.ts";

/** Where the last copy of each group's stats is kept on this device, per person signed in. */
export interface StatsCopyStorage {
  readonly load: (groupId: GroupId) => string | null;
  /** Null forgets it. */
  readonly save: (groupId: GroupId, value: string | null) => void;
}

const StatsCopy = Schema.Struct({
  fetchedAt: Schema.DateTimeUtc,
  detail: GroupDetail,
  stats: GroupStats,
});
export type StatsCopy = typeof StatsCopy.Type;

const Json = Schema.toCodecJson(StatsCopy);
const decode = Schema.decodeUnknownOption(Json);
const encode = Schema.encodeSync(Json);

const TRIP_INDEX = "_trips" as GroupId;
const TripIndex = Schema.Array(
  Schema.Struct({
    tripId: TripId,
    groupId: GroupId,
    groupName: Schema.String,
  }),
);
const IndexJson = Schema.toCodecJson(TripIndex);
const decodeIndex = Schema.decodeUnknownOption(IndexJson);
const encodeIndex = Schema.encodeSync(IndexJson);

export const makeStatsCopies = (storage: StatsCopyStorage) => {
  const readIndex = () => {
    try {
      const kept = storage.load(TRIP_INDEX);
      return kept === null ? [] : (Option.getOrNull(decodeIndex(JSON.parse(kept))) ?? []);
    } catch {
      return [];
    }
  };
  const writeIndex = (entries: typeof TripIndex.Type) => {
    try {
      storage.save(TRIP_INDEX, entries.length === 0 ? null : JSON.stringify(encodeIndex(entries)));
    } catch {
      // A full or missing store only costs the offline trip lookup.
    }
  };
  const load = (groupId: GroupId): StatsCopy | null => {
    try {
      const kept = storage.load(groupId);
      return kept === null ? null : Option.getOrNull(decode(JSON.parse(kept)));
    } catch {
      return null;
    }
  };
  return {
    load,
    save: (groupId: GroupId, copy: StatsCopy) => {
      try {
        storage.save(groupId, JSON.stringify(encode(copy)));
      } catch {
        // A full or missing store only costs the offline copy.
      }
      const rest = readIndex().filter((entry) => entry.groupId !== groupId);
      const own = copy.detail.trips.map((trip) => ({
        tripId: trip.id,
        groupId,
        groupName: copy.detail.group.name,
      }));
      writeIndex([...rest, ...own]);
    },
    forget: (groupId: GroupId) => {
      try {
        storage.save(groupId, null);
      } catch {
        // Nothing was kept.
      }
      const next = readIndex().filter((entry) => entry.groupId !== groupId);
      writeIndex(next);
    },
    rememberGroups: (groups: ReadonlyArray<Pick<GroupListItem, "group" | "trips">>) => {
      writeIndex(
        groups.flatMap((item) =>
          item.trips.map((trip) => ({
            tripId: trip.id,
            groupId: item.group.id,
            groupName: item.group.name,
          })),
        ),
      );
    },
    groupOfTrip: (
      tripId: TripId,
    ): { readonly groupId: GroupId; readonly groupName: string } | null => {
      const match = readIndex().find((entry) => entry.tripId === tripId);
      return match ? { groupId: match.groupId, groupName: match.groupName } : null;
    },
    groupName: (groupId: GroupId): string | null =>
      readIndex().find((entry) => entry.groupId === groupId)?.groupName ??
      load(groupId)?.detail.group.name ??
      null,
  };
};
export type StatsCopies = ReturnType<typeof makeStatsCopies>;

/**
 * What a group's stats screen shows, from its two queries and the copy kept on the device: the
 * API's refusal (which no live or saved copy outlives), the live numbers, the last copy when the
 * network can't be reached (with when it was fetched), or an unavailable state when there's no
 * copy.
 */
export const statsState = <E1, E2>(
  detail: AsyncResult.AsyncResult<GroupDetail, E1>,
  stats: AsyncResult.AsyncResult<GroupStats, E2>,
  copy: () => StatsCopy | null,
) => {
  const errors = [
    ...(AsyncResult.isFailure(detail) ? [Cause.squash(detail.cause)] : []),
    ...(AsyncResult.isFailure(stats) ? [Cause.squash(stats.cause)] : []),
  ];
  for (const error of errors) {
    if (!isRetryable(error)) return { kind: "refused" as const, message: describeError(error) };
  }
  if (AsyncResult.isSuccess(detail) && AsyncResult.isSuccess(stats))
    return {
      kind: "live" as const,
      detail: detail.value,
      stats: stats.value,
      // When both came back, for the copy kept on the device.
      fetchedAt: Math.min(detail.timestamp, stats.timestamp),
    };
  if (errors.length > 0) {
    const kept = <A, E>(result: AsyncResult.AsyncResult<A, E>) =>
      AsyncResult.isSuccess(result)
        ? Option.some({ value: result.value, timestamp: result.timestamp })
        : AsyncResult.isFailure(result)
          ? Option.map(result.previousSuccess, (previous) => ({
              value: previous.value,
              timestamp: previous.timestamp,
            }))
          : Option.none();
    const keptDetail = kept(detail);
    const keptStats = kept(stats);
    if (Option.isSome(keptDetail) && Option.isSome(keptStats))
      return {
        kind: "saved" as const,
        copy: {
          fetchedAt: DateTime.makeUnsafe(
            Math.min(keptDetail.value.timestamp, keptStats.value.timestamp),
          ),
          detail: keptDetail.value.value,
          stats: keptStats.value.value,
        },
      };
    const saved = copy();
    return saved ? { kind: "saved" as const, copy: saved } : { kind: "unavailable" as const };
  }
  return { kind: "loading" as const };
};

export type StatsState = ReturnType<typeof statsState>;

/** "Saved Nov 14, 9:41 PM": when the copy on screen was fetched. */
export const savedLine = (fetchedAt: DateTime.Utc) =>
  `Saved ${DateTime.format(DateTime.setZone(fetchedAt, DateTime.zoneMakeLocal()), {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
