import { describe, expect, it } from "@effect/vitest";
import {
  Forbidden,
  GroupId,
  PlayerId,
  UserId,
  type GroupDetail,
  type GroupStats,
} from "@stacks/contracts";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as AsyncResult from "effect/reactivity/AsyncResult";

import { makeStatsCopies, statsState, type StatsCopy } from "./statsCopy.ts";

const groupId = GroupId.make("0192e7a0-0000-7000-8000-000000000010");
const me = PlayerId.make("0192e7a0-0000-7000-8000-000000000001");
const detail: GroupDetail = {
  group: {
    id: groupId,
    name: "Thursday crew",
    currency: "USD" as GroupDetail["group"]["currency"],
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
  trips: [],
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

  it("shows the API's refusal, never an old copy", () => {
    const refused = AsyncResult.failure<GroupStats, Forbidden>(
      Cause.fail(new Forbidden({ reason: "not_a_member" })),
    );
    expect(statsState(AsyncResult.success(detail), refused, () => copy)).toEqual({
      kind: "refused",
      message: "You're not in this group.",
    });
  });
});

describe("makeStatsCopies", () => {
  it("keeps, reads and forgets a copy, and treats a damaged one as none", () => {
    const kept = new Map<string, string>();
    const copies = makeStatsCopies({
      load: (id) => kept.get(id) ?? null,
      save: (id, value) => (value === null ? kept.delete(id) : kept.set(id, value)),
    });
    expect(copies.load(groupId)).toBeNull();
    copies.save(groupId, copy);
    expect(copies.load(groupId)).toEqual(copy);
    kept.set(groupId, "{not json");
    expect(copies.load(groupId)).toBeNull();
    copies.forget(groupId);
    expect(kept.has(groupId)).toBe(false);
  });
});
