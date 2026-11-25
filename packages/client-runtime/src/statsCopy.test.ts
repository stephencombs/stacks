import { describe, expect, it } from "@effect/vitest";
import {
  Forbidden,
  CurrencyCode,
  GroupId,
  PlayerId,
  TripId,
  UserId,
  type GroupDetail,
  type GroupStats,
} from "@stacks/contracts";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import * as AsyncResult from "effect/reactivity/AsyncResult";

import { makeStatsCopies, statsState, type StatsCopy } from "./statsCopy.ts";

const groupId = GroupId.make("0192e7a0-0000-7000-8000-000000000010");
const tripId = TripId.make("0192e7a0-0000-7000-8000-000000000020");
const me = PlayerId.make("0192e7a0-0000-7000-8000-000000000001");

const detail: GroupDetail = {
  group: {
    id: groupId,
    name: "Thursday crew",
    currency: CurrencyCode.make("USD"),
    createdAt: DateTime.makeUnsafe("2026-10-01T00:00:00Z"),
  },
  role: "owner",
  myPlayerId: me,
  players: [
    {
      id: me,
      displayName: "Alex",
      userId: UserId.make("user_alex"),
      role: "owner",
      claimCode: null,
    },
  ],
  trips: [
    {
      id: tripId,
      groupId,
      name: "Vegas weekend",
      startedAt: DateTime.makeUnsafe("2026-10-15T00:00:00Z"),
      endedAt: null,
      createdBy: UserId.make("user_alex"),
      createdAt: DateTime.makeUnsafe("2026-10-15T00:00:00Z"),
    },
  ],
};

const stats: GroupStats = { plays: [], venues: [] };
const copy: StatsCopy = { fetchedAt: DateTime.makeUnsafe("2026-11-14T21:41:00Z"), detail, stats };
const offline = <A>() => AsyncResult.failure<A, Error>(Cause.fail(new Error("Failed to fetch")));

describe("statsState", () => {
  it("shows the live numbers, stamped with when both came back", () => {
    const state = statsState(
      AsyncResult.success(detail, { timestamp: 20 }),
      AsyncResult.success(stats, { timestamp: 10 }),
      () => copy,
    );

    expect(state).toEqual({ kind: "live", detail, stats, fetchedAt: 10 });
  });

  it("waits for both before showing anything", () => {
    expect(
      statsState(AsyncResult.success(detail), AsyncResult.initial<GroupStats>(), () => copy).kind,
    ).toBe("loading");
  });

  it("falls back to the copy on the device when the network can't be reached", () => {
    expect(statsState(offline<GroupDetail>(), offline<GroupStats>(), () => copy)).toEqual({
      kind: "saved",
      copy,
    });
    expect(statsState(offline<GroupDetail>(), AsyncResult.initial(), () => null)).toEqual({
      kind: "unavailable",
    });
  });

  it("treats an offline refetch after a successful load as saved so the stale note shows", () => {
    const prevDetail = AsyncResult.success(detail, { timestamp: 1000 });
    const prevStats = AsyncResult.success(stats, { timestamp: 2000 });

    const failedDetail = AsyncResult.failure<GroupDetail, Error>(
      Cause.fail(new Error("Failed to fetch")),
      { previousSuccess: Option.some(prevDetail) },
    );

    const failedStats = AsyncResult.failure<GroupStats, Error>(
      Cause.fail(new Error("Failed to fetch")),
      { previousSuccess: Option.some(prevStats) },
    );

    expect(statsState(failedDetail, failedStats, () => null)).toEqual({
      kind: "saved",
      copy: { fetchedAt: DateTime.makeUnsafe(1000), detail, stats },
    });
  });

  it("shows the API's refusal, never a cold copy or a previousSuccess", () => {
    const prevStats = AsyncResult.success(stats, { timestamp: 2000 });

    const refused = AsyncResult.failure<GroupStats, Forbidden>(
      Cause.fail(new Forbidden({ reason: "not_a_member" })),
      { previousSuccess: Option.some(prevStats) },
    );

    expect(statsState(AsyncResult.success(detail), refused, () => copy)).toEqual({
      kind: "refused",
      message: "You're not in this group.",
    });
  });
});

describe("makeStatsCopies", () => {
  it("reads a copy saved before the funding fields, and keeps them once present", () => {
    const kept = new Map<string, string>();

    const copies = makeStatsCopies({
      load: (id) => kept.get(id) ?? null,
      save: (id, value) => (value === null ? kept.delete(id) : kept.set(id, value)),
    });

    copies.save(groupId, copy);
    const older = JSON.parse(kept.get(groupId)!);
    expect(Object.keys(older.stats)).toEqual(["plays", "venues"]);
    kept.set(groupId, JSON.stringify(older));

    const loaded = copies.load(groupId);
    expect(loaded).toEqual(copy);
    expect(loaded?.stats.reloads).toBeUndefined();
    expect(loaded?.stats.stakes).toBeUndefined();

    const funded: StatsCopy = {
      ...copy,
      stats: { plays: [], venues: [], reloads: [], allVisits: [], covered: [], stakes: [] },
    };

    copies.save(groupId, funded);
    expect(copies.load(groupId)).toEqual(funded);
  });

  it("keeps, reads and forgets a copy, indexes trips offline, and treats damaged data as none", () => {
    const kept = new Map<string, string>();

    const copies = makeStatsCopies({
      load: (id) => kept.get(id) ?? null,
      save: (id, value) => (value === null ? kept.delete(id) : kept.set(id, value)),
    });

    expect(copies.load(groupId)).toBeNull();
    expect(copies.groupOfTrip(tripId)).toBeNull();
    copies.save(groupId, copy);
    expect(copies.load(groupId)).toEqual(copy);
    expect(copies.groupOfTrip(tripId)).toEqual({ groupId, groupName: "Thursday crew" });
    expect(copies.groupName(groupId)).toBe("Thursday crew");
    kept.set(groupId, "{not json");
    expect(copies.load(groupId)).toBeNull();
    copies.forget(groupId);
    expect(kept.has(groupId)).toBe(false);
    expect(copies.groupOfTrip(tripId)).toBeNull();

    const otherTrip = TripId.make("0192e7a0-0000-7000-8000-000000000021");
    copies.rememberGroups([
      {
        group: { id: groupId, name: "Thursday crew" },
        trips: [{ id: otherTrip }],
      },
    ]);
    expect(copies.groupOfTrip(otherTrip)).toEqual({ groupId, groupName: "Thursday crew" });
  });
});
