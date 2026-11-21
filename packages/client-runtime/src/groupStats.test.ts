import { describe, expect, it } from "@effect/vitest";
import {
  CurrencyCode,
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

const alex = PlayerId.make(id(1));
const bea = PlayerId.make(id(2));
const cal = PlayerId.make(id(3));
const dee = PlayerId.make(id(4));

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

const detail: GroupDetail = {
  group: {
    id: groupId,
    name: "Thursday crew",
    currency: CurrencyCode.make("USD"),
    createdAt: at("2026-10-01T00:00:00Z"),
  },
  role: "owner",
  myPlayerId: alex,
  players: [
    player(alex, "Alex", "owner"),
    player(bea, "Bea", "member"),
    player(cal, "Cal", "member"),
    player(dee, "Dee", null),
  ],
  trips: [trip(reno, "Reno"), trip(vegas, "Vegas")],
};

let count = 0;

const play = (tripId: TripId, startedAt: string, results: ReadonlyArray<[PlayerId, number]>) => {
  const start = at(startedAt);

  return {
    id: TableId.make(id(100 + ++count)),
    tripId,
    game: "blackjack" as const,
    venueId: wynn,
    startedAt: start,
    endedAt: DateTime.makeUnsafe(DateTime.toEpochMillis(start) + 90 * 60_000),
    results: results.map(([playerId, net]) => ({
      playerId,
      net: MinorUnits.make(net),
      buyIn: MinorUnits.make(Math.max(0, -net)),
      milliseconds: 90 * 60_000,
    })),
  };
};

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
      ["Night owl", "Alex", "Sat down at 3:00 AM"],
    ]);
    expect(view.race.marks.map((mark) => mark.label)).toEqual(["Day 1"]);
    expect(view.chips.map((chip) => chip.label)).toEqual(["Vegas", "All games", "All casinos"]);
  });

  it("supplies a trip's date range and each player's best session in scope", () => {
    const view = groupStatsView(stats, detail, { tripId: vegas }, { timeZone: zone, clock });

    if (view.kind !== "stats") throw new Error(view.kind);
    expect(view.trips.total).toBe(3);
    expect(view.trips.byId.get(vegas)).toEqual({ sessions: 2, range: "Oct 1–3, 2026" });
    expect(view.standings.find((row) => row.playerId === bea)?.best).toEqual({
      line: "Wynn · Oct 3",
      result: 10000,
    });
    expect(view.standings.find((row) => row.playerId === cal)?.best).toBeUndefined();
  });

  it("keeps cent and privacy preferences in trip awards", () => {
    const visible = groupStatsView(
      stats,
      detail,
      { tripId: vegas },
      { timeZone: zone, clock, showCents: true },
    );

    const hidden = groupStatsView(
      stats,
      detail,
      { tripId: vegas },
      { timeZone: zone, clock, privacyMode: true },
    );

    if (visible.kind !== "stats" || hidden.kind !== "stats") throw new Error("Missing group stats");
    expect(visible.awards?.[0]?.line).toBe("+$300.00 at Wynn");
    expect(hidden.awards?.[0]?.line).not.toContain("300");
    expect(hidden.awards?.[1]?.line).not.toContain("100");
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
