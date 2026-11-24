import { describe, expect, it } from "@effect/vitest";
import {
  CurrencyCode,
  GroupId,
  MinorUnits,
  PlayerId,
  StakeId,
  TableId,
  TripId,
  UserId,
  VenueId,
  type GroupDetail,
  type GroupStats,
  type Trip,
} from "@stacks/contracts";
import type { TripClock } from "@stacks/shared/trips";
import * as DateTime from "effect/DateTime";

import { groupStatsView, lineText, type Line } from "./groupStats.ts";
import type { StatsFilters } from "./stats.ts";

const zone = DateTime.zoneMakeNamedUnsafe("UTC");

const clock: TripClock = {
  night: (at) => new Date(DateTime.toEpochMillis(at) - 6 * 3_600_000).toISOString().slice(0, 10),
  hour: (at) => new Date(DateTime.toEpochMillis(at)).getUTCHours(),
};

const id = (n: number) => `0192e7a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = (iso: string) => DateTime.makeUnsafe(iso);

const me = PlayerId.make(id(1));
const sam = PlayerId.make(id(2));
const maya = PlayerId.make(id(3));

const groupId = GroupId.make(id(10));
const feb = TripId.make(id(20));
const mar = TripId.make(id(21));
const wynn = VenueId.make(id(30));
const money = MinorUnits.make;

const person = (playerId: PlayerId, displayName: string) => ({
  id: playerId,
  displayName,
  userId: UserId.make(`user_${displayName}`),
  role: "member" as const,
  claimCode: null,
});

const trip = (tripId: TripId, name: string, start: string, end: string | null) =>
  ({
    id: tripId,
    groupId,
    name,
    startedAt: at(start),
    endedAt: end === null ? null : at(end),
    createdBy: UserId.make("user_Me"),
    createdAt: at(start),
  }) satisfies Trip;

const detail = {
  group: {
    id: groupId,
    name: "Vegas crew",
    currency: CurrencyCode.make("USD"),
    createdAt: at("2026-01-01T00:00:00Z"),
  },
  role: "owner",
  myPlayerId: me,
  players: [
    { ...person(me, "Me"), role: "owner" as const },
    person(sam, "Sam"),
    person(maya, "Maya"),
  ],
  trips: [
    trip(feb, "Feb weekend", "2026-02-13T00:00:00Z", "2026-02-16T00:00:00Z"),
    trip(mar, "March trip", "2026-03-27T00:00:00Z", "2026-03-30T00:00:00Z"),
  ],
} satisfies GroupDetail;

let count = 0;

const play = (tripId: TripId, startedAt: string, game: "blackjack" | "craps" = "blackjack") => {
  const start = at(startedAt);

  return {
    id: TableId.make(id(1000 + ++count)),
    tripId,
    game,
    venueId: wynn,
    startedAt: start,
    endedAt: DateTime.makeUnsafe(DateTime.toEpochMillis(start) + 3_600_000),
    results: [me, sam].map((playerId) => ({
      playerId,
      net: money(100),
      buyIn: money(10000),
      milliseconds: 3_600_000,
    })),
  };
};

const febPlays = Array.from({ length: 6 }, (_, i) => play(feb, `2026-02-${14 + i}T20:00:00Z`));
const marPlay = play(mar, "2026-03-28T20:00:00Z", "craps");
const plays = [...febPlays, marPlay];

const reload = (index: number, playerId: PlayerId, additional: number, net: number) => ({
  playId: plays[index]!.id,
  playerId,
  additional,
  net: money(net),
});

const cover = (index: number, payerId: PlayerId, playerId: PlayerId, amount: number) => ({
  playId: plays[index]!.id,
  payerId,
  playerId,
  amount: money(amount),
});

const stake = (
  n: number,
  tripId: TripId,
  fields: { owed?: number; final?: boolean; lender?: PlayerId; borrower?: PlayerId } = {},
) => ({
  stakeId: StakeId.make(id(2000 + n)),
  tripId,
  lenderId: fields.lender ?? me,
  borrowerId: fields.borrower ?? sam,
  amount: money(10000),
  owed: money(fields.owed ?? 10000),
  final: fields.final ?? true,
});

const venues: GroupStats["venues"] = [
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
];

const shown = (extra: Partial<GroupStats> = {}, filters: StatsFilters = {}) => {
  const view = groupStatsView({ plays, venues, ...extra }, detail, filters, {
    timeZone: zone,
    clock,
  });

  if (view.kind !== "stats") throw new Error(view.kind);

  return view;
};

const said = (line: Line) => lineText(line, ({ amount }) => `$${amount / 100}`);

const fiveReloads = [
  reload(0, me, 1, 500),
  reload(1, sam, 2, -300),
  reload(2, me, 1, 200),
  reload(3, maya, 1, -100),
  reload(4, sam, 1, 400),
];

describe("group stats funding", () => {
  describe("without funding data", () => {
    it("hides Backing and the additional buy-ins row when the server said nothing", () => {
      const view = shown();

      expect(view.backing).toBeNull();
      expect(view.habits).toBeNull();
    });

    it("hides them when the data is complete and nobody funded anything", () => {
      const view = shown({ reloads: [], allVisits: [], covered: [], stakes: [] });

      expect(view.backing).toBeNull();
      expect(view.habits).toBeNull();
    });

    it("hides Backing for exactly one covered entry and no stakes", () => {
      expect(shown({ covered: [cover(0, me, sam, 5000)], stakes: [] }).backing).toBeNull();
      expect(shown({ covered: [cover(0, me, sam, 5000)] }).backing).toBeNull();
    });
  });

  describe("with additional buy-ins", () => {
    it("says how many finished up, who added the most and their summed result", () => {
      const view = shown({
        reloads: fiveReloads,
        allVisits: plays.map((p) => ({ playId: p.id, visits: 2 })),
      });

      const [row] = view.habits!;

      expect(row!.title).toBe("With additional buy-ins");
      expect(said(row!.line)).toBe(
        "3 of 5 visits with an additional buy-in finished up · Sam added the most (3) · 5 of 14 visits had one",
      );
      expect(said(row!.trailing!)).toBe("$7");
    });

    it("hides below five visits and drops the clause on a tie", () => {
      expect(shown({ reloads: fiveReloads.slice(0, 4) }).habits).toBeNull();

      const tied = [
        reload(0, me, 1, 100),
        reload(1, me, 1, 100),
        reload(2, sam, 1, 100),
        reload(3, sam, 1, 100),
        reload(4, maya, 2, 100),
      ];

      expect(said(shown({ reloads: tied }).habits![0]!.line)).toBe(
        "5 of 5 visits with an additional buy-in finished up",
      );
    });

    it("counts only visits at the plays the filters leave", () => {
      expect(
        shown({ reloads: [...fiveReloads, reload(6, me, 1, 100)] }, { tripId: feb }).habits,
      ).not.toBeNull();
      expect(
        shown({ reloads: [...fiveReloads, reload(6, me, 1, 100)] }, { tripId: mar }).habits,
      ).toBeNull();
      expect(shown({ reloads: fiveReloads }, { game: "craps" }).habits).toBeNull();
    });

    it("sits above After midnight", () => {
      const late = Array.from({ length: 6 }, (_, i) =>
        play(feb, `2026-02-0${1 + i}T0${i % 5}:00:00Z`),
      );

      const rest = Array.from({ length: 6 }, (_, i) => play(feb, `2026-02-${10 + i}T14:00:00Z`));
      const all = [...late, ...rest];

      const view = groupStatsView(
        {
          plays: all,
          venues,
          reloads: all
            .slice(0, 5)
            .map((p) => ({ playId: p.id, playerId: me, additional: 1, net: money(1) })),
        },
        detail,
        {},
        { timeZone: zone, clock },
      );

      if (view.kind !== "stats") throw new Error(view.kind);
      expect(view.habits!.map((row) => row.key)).toEqual(["reload", "late"]);
    });
  });

  describe("backing", () => {
    it("names who covered the most, by amount, with entries and friends", () => {
      const view = shown({
        covered: [cover(0, sam, me, 4000), cover(1, sam, maya, 6000), cover(2, me, sam, 9000)],
      });

      const row = view.backing!.covered!;

      expect(row.title).toBe("Sam covered the most");
      expect(said(row.line)).toBe("2 buy-ins for 2 friends");
      expect(said(row.trailing!)).toBe("$100");
      expect(row.trailing![0]).toMatchObject({ tone: "plain" });
      expect(view.backing!.stakes).toBeNull();
    });

    it("hides the row on a tie and follows the filters", () => {
      const covered = [cover(0, sam, me, 5000), cover(1, me, sam, 5000)];

      expect(shown({ covered }).backing).toBeNull();
      expect(
        shown({ covered: [...covered, cover(6, sam, maya, 100)] }, { tripId: feb }).backing,
      ).toBeNull();
      expect(
        shown(
          { covered: [cover(0, sam, me, 5000), cover(1, sam, maya, 100), cover(6, me, sam, 9000)] },
          { tripId: mar },
        ).backing,
      ).toBeNull();
    });

    it("opens a trip only when one is selected", () => {
      const covered = [cover(0, sam, me, 5000), cover(1, sam, maya, 100)];

      expect(shown({ covered }).backing!.covered!.tripId).toBeNull();
      expect(shown({ covered }, { tripId: feb }).backing!.covered!.tripId).toBe(feb);
    });

    it("lists stakes newest first with the backer's result, three rows then all of them", () => {
      const stakes = [
        stake(1, feb, { owed: 12000 }),
        stake(2, feb, { owed: 3000, final: false }),
        stake(3, mar),
        stake(4, mar, { lender: sam, borrower: me }),
      ];

      const view = shown({ stakes });
      const list = view.backing!.stakes!;

      expect(list.rows.map((row) => row.title)).toEqual([
        "Sam backed you",
        "You backed Sam",
        "You backed Sam",
      ]);
      expect(said(list.rows[1]!.line)).toBe("$100 on March trip");
      expect(said(list.rows[2]!.line)).toBe("$100 on Feb weekend · so far");
      expect(said(list.rows[2]!.trailing!)).toBe("$-70");
      expect(list.all).toHaveLength(4);
      expect(view.backing!.covered).toBeNull();
      expect(view.backing!.whole).toBe(false);
    });

    it("follows the trips with play in the period, or the selected trip", () => {
      const stakes = [stake(1, feb), stake(2, mar)];

      expect(shown({ stakes }, { year: 2026 }).backing!.stakes!.rows).toHaveLength(2);
      expect(shown({ stakes }, { tripId: mar }).backing!.stakes!.rows.map((r) => r.key)).toEqual([
        stakes[1]!.stakeId,
      ]);
      expect(shown({ stakes: [stake(1, TripId.make(id(29)))] }, { year: 2026 }).backing).toBeNull();
    });

    it("says it covers whole trips once a game or casino is applied", () => {
      const stakes = [stake(1, feb), stake(2, mar)];

      expect(shown({ stakes }, { game: "craps" }).backing).toMatchObject({ whole: true });
      expect(shown({ stakes }, { venueId: wynn }).backing).toMatchObject({ whole: true });
      expect(shown({ stakes }, { game: "craps" }).backing!.stakes!.rows).toHaveLength(2);
    });

    it("shows a stake with no play and so no result yet", () => {
      const view = shown({ stakes: [stake(1, feb, { final: false })] }, { tripId: feb });

      expect(view.backing!.stakes!.rows).toHaveLength(1);
      expect(said(view.backing!.stakes!.rows[0]!.trailing!)).toBe("$0");
    });
  });
});
