import { describe, expect, it } from "@effect/vitest";
import {
  GroupId,
  MinorUnits,
  PlayerId,
  TableId,
  TripId,
  UserId,
  VenueId,
  type GroupDetail,
  type GroupStats,
} from "@stacks/contracts";
import type { TripClock } from "@stacks/shared/trips";
import * as DateTime from "effect/DateTime";

import { groupChip, groupStatsView } from "./groupStats.ts";

const zone = DateTime.zoneMakeNamedUnsafe("UTC");
const clock: TripClock = {
  night: (at) => new Date(DateTime.toEpochMillis(at) - 6 * 3_600_000).toISOString().slice(0, 10),
  hour: (at) => new Date(DateTime.toEpochMillis(at)).getUTCHours(),
};
const id = (n: number) => `0192e7a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const [alex, bea, cal, dee] = [1, 2, 3, 4].map((n) => PlayerId.make(id(n))) as [
  PlayerId,
  PlayerId,
  PlayerId,
  PlayerId,
];
const groupId = GroupId.make(id(10));
const vegas = TripId.make(id(20));
const reno = TripId.make(id(21));
const wynn = VenueId.make(id(30));
const at = (iso: string) => DateTime.makeUnsafe(iso);

const player = (playerId: PlayerId, displayName: string, role: "owner" | "member" | null) => ({
  id: playerId,
  displayName,
  userId: role === null ? null : UserId.make(`user_${displayName}`),
  role,
  claimCode: null,
});
const trip = (tripId: TripId, name: string) => ({
  id: tripId,
  groupId,
  name,
  startedAt: at("2026-10-01T00:00:00Z"),
  endedAt: null,
  createdBy: UserId.make("user_Alex"),
  createdAt: at("2026-10-01T00:00:00Z"),
});
const detail = {
  group: { name: "Thursday crew", currency: "USD" },
  role: "owner",
  myPlayerId: alex,
  // Dee left the group; Cal is in it but hasn't played.
  players: [
    player(alex, "Alex", "owner"),
    player(bea, "Bea", "member"),
    player(cal, "Cal", "member"),
    player(dee, "Dee", null),
  ],
  trips: [trip(reno, "Reno"), trip(vegas, "Vegas")],
} as unknown as GroupDetail;

let count = 0;
const play = (
  tripId: TripId,
  startedAt: string,
  results: ReadonlyArray<[PlayerId, number]>,
): GroupStats["plays"][number] => ({
  id: TableId.make(id(100 + ++count)),
  tripId,
  game: "blackjack",
  venueId: wynn,
  startedAt: at(startedAt),
  results: results.map(([playerId, net]) => ({
    playerId,
    net: MinorUnits.make(net),
    buyIn: MinorUnits.make(Math.max(0, -net)),
    minutes: 90,
  })),
});
const stats: GroupStats = {
  plays: [
    play(vegas, "2026-10-02T20:00:00Z", [
      [alex, 30000],
      [bea, -10000],
      [dee, 5000],
    ]),
    play(vegas, "2026-10-03T03:00:00Z", [
      [alex, -10000],
      [bea, 10000],
    ]),
    play(reno, "2026-11-01T20:00:00Z", [[bea, 20000]]),
  ],
  venues: [
    {
      id: wynn,
      name: "Wynn",
      kind: "casino",
      city: null,
      region: null,
      country: null,
      lat: null,
      lng: null,
      verified: true,
      groupId: null,
    },
  ],
};

describe("groupStatsView", () => {
  it("leads with standings: ties share a rank, you're marked, and a member who hasn't played sits last", () => {
    const view = groupStatsView(stats, detail, {}, { timeZone: zone, clock });
    expect(view.kind).toBe("stats");
    if (view.kind !== "stats") return;
    expect(view.standings.map((row) => [row.name, row.rank, row.you, row.result])).toEqual([
      ["Alex", 1, true, 20000],
      ["Bea", 1, false, 20000],
      ["Dee", 3, false, 5000],
      ["Cal", null, false, 0],
    ]);
    expect(view.total).toBe(45000);
    expect(view.standings[0]!.sheet).toEqual({
      result: 20000,
      sessions: 2,
      hours: "3h",
      hourlyResult: 6667,
      winRate: "50%",
      winRateLine: "1 of 2",
    });
    expect(view.standings[3]!.meta).toBe("No sessions");
    // Awards belong to one trip.
    expect(view.awards).toBeNull();
    expect(view.race.marks.map((mark) => mark.label)).toEqual(["Vegas", "Reno"]);
  });

  it("hands out a trip's awards and marks its nights once a trip is picked", () => {
    const view = groupStatsView(stats, detail, { tripId: vegas }, { timeZone: zone, clock });
    if (view.kind !== "stats") throw new Error(view.kind);
    expect(view.title).toBe("Vegas");
    expect(view.awards?.map((award) => [award.title, award.name, award.line])).toEqual([
      ["Biggest hit", "Alex", "+$300 at Wynn"],
      ["Comeback kid", "Bea", "Climbed $100 from their low"],
      // Alex already holds an award, but nobody else sat down late.
      ["Night owl", "Alex", "Sat down at 3:00 AM"],
    ]);
    // The 3am table counts toward the night before.
    expect(view.race.marks.map((mark) => mark.label)).toEqual(["Day 1"]);
    expect(view.chips.map((chip) => chip.label)).toEqual(["Vegas", "All games", "All casinos"]);
  });

  it("leaves the place off a biggest hit at a table with no casino set", () => {
    const [first] = stats.plays;
    const view = groupStatsView(
      { ...stats, plays: [{ ...first!, venueId: null }] },
      detail,
      { tripId: vegas },
      { timeZone: zone, clock },
    );
    if (view.kind !== "stats") throw new Error(view.kind);
    expect(view.awards?.[0]?.line).toBe("+$300");
  });

  it("says why nothing shows, and that a group with no finished play has nothing yet", () => {
    const none = groupStatsView(stats, detail, { game: "craps" }, { timeZone: zone, clock });
    expect(none).toMatchObject({ kind: "no_match", sentence: "No finished Craps sessions." });
    expect(
      groupStatsView({ plays: [], venues: [] }, detail, {}, { timeZone: zone, clock }).kind,
    ).toBe("empty");
  });
});

describe("groupChip", () => {
  it("reads Just me until a group is picked", () => {
    const groups = [{ id: groupId, name: "Thursday crew" }];
    expect(groupChip(groups, null)).toMatchObject({
      applied: false,
      value: "",
      options: [
        { value: "", label: "Just me" },
        { value: groupId, label: "Thursday crew" },
      ],
    });
    expect(groupChip(groups, groupId)).toMatchObject({ applied: true, value: groupId });
  });
});
