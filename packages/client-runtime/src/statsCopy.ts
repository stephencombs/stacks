import { GroupDetail, GroupStats, type GroupId } from "@stacks/contracts";
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

export const makeStatsCopies = (storage: StatsCopyStorage) => ({
  load: (groupId: GroupId): StatsCopy | null => {
    try {
      const kept = storage.load(groupId);
      return kept === null ? null : Option.getOrNull(decode(JSON.parse(kept)));
    } catch {
      return null;
    }
  },
  save: (groupId: GroupId, copy: StatsCopy) => {
    try {
      storage.save(groupId, JSON.stringify(encode(copy)));
    } catch {
      // A full or missing store only costs the offline copy.
    }
  },
  forget: (groupId: GroupId) => {
    try {
      storage.save(groupId, null);
    } catch {
      // Nothing was kept.
    }
  },
});
export type StatsCopies = ReturnType<typeof makeStatsCopies>;

/**
 * What a group's stats screen shows, from its two queries and the copy kept on the device: the
 * live numbers, the last copy when the network can't be reached (with when it was fetched), an
 * unavailable state when there's no copy, or the API's refusal, which no copy outlives.
 */
export const statsState = <E1, E2>(
  detail: AsyncResult.AsyncResult<GroupDetail, E1>,
  stats: AsyncResult.AsyncResult<GroupStats, E2>,
  copy: () => StatsCopy | null,
) => {
  const value = <A, E>(result: AsyncResult.AsyncResult<A, E>) =>
    AsyncResult.isSuccess(result)
      ? Option.some(result.value)
      : AsyncResult.isFailure(result)
        ? Option.map(result.previousSuccess, (previous) => previous.value)
        : Option.none();
  const shownDetail = value(detail);
  const shownStats = value(stats);
  if (Option.isSome(shownDetail) && Option.isSome(shownStats))
    return {
      kind: "live" as const,
      detail: shownDetail.value,
      stats: shownStats.value,
      // When both came back, for the copy kept on the device.
      fetchedAt:
        AsyncResult.isSuccess(detail) && AsyncResult.isSuccess(stats)
          ? Math.min(detail.timestamp, stats.timestamp)
          : null,
    };
  const error = AsyncResult.isFailure(detail)
    ? Cause.squash(detail.cause)
    : AsyncResult.isFailure(stats)
      ? Cause.squash(stats.cause)
      : undefined;
  if (error === undefined) return { kind: "loading" as const };
  if (!isRetryable(error)) return { kind: "refused" as const, message: describeError(error) };
  const saved = copy();
  return saved ? { kind: "saved" as const, copy: saved } : { kind: "unavailable" as const };
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
