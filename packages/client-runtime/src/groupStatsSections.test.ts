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
  type Trip,
} from "@stacks/contracts";
import type { TripClock } from "@stacks/shared/trips";
import * as DateTime from "effect/DateTime";
import * as Predicate from "effect/Predicate";

import { groupStatsView, lineText, type Line } from "./groupStats.ts";
import type { StatsFilters } from "./stats.ts";

const zone = DateTime.zoneMakeNamedUnsafe("UTC");

const clock: TripClock = {
  night: (at) => new Date(DateTime.toEpochMillis(at) - 6 * 3_600_000).toISOString().slice(0, 10),
  hour: (at) => new Date(DateTime.toEpochMillis(at)).getUTCHours(),
};

const id = (n: number) => `0192e7a0-0000-7000-8000-${String(n).padStart(12, "0")}`;

const me = PlayerId.make(id(1));
const sam = PlayerId.make(id(2));
const maya = PlayerId.make(id(3));
const dev = PlayerId.make(id(4));

const groupId = GroupId.make(id(10));
const feb = TripId.make(id(20));
const mar = TripId.make(id(21));
const jun = TripId.make(id(22));
const wynn = VenueId.make(id(30));
const at = (iso: string) => DateTime.makeUnsafe(iso);

const player = (playerId: PlayerId, displayName: string) => ({
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

const detailWith = (trips: ReadonlyArray<Trip>) =>
  ({
    group: {
      id: groupId,
      name: "Vegas crew",
      currency: CurrencyCode.make("USD"),
      createdAt: at("2026-01-01T00:00:00Z"),
    },
    role: "owner",
    myPlayerId: me,
    players: [
      { ...player(me, "Me"), role: "owner" as const },
      player(sam, "Sam"),
      player(maya, "Maya"),
      player(dev, "Dev"),
    ],
    trips,
  }) satisfies GroupDetail;

const closed = [
  trip(feb, "Feb weekend", "2026-02-13T00:00:00Z", "2026-02-16T00:00:00Z"),
  trip(mar, "March trip", "2026-03-27T00:00:00Z", "2026-03-30T00:00:00Z"),
];

let count = 0;

type Seat = readonly [PlayerId, number, number?, number?];

const play = (
  tripId: TripId,
  startedAt: string,
  seats: ReadonlyArray<Seat>,
  game: "blackjack" | "craps" = "blackjack",
) => {
  const start = at(startedAt);

  return {
    id: TableId.make(id(1000 + ++count)),
    tripId,
    game,
    venueId: wynn,
    startedAt: start,
    endedAt: DateTime.makeUnsafe(DateTime.toEpochMillis(start) + 3_600_000),
    results: seats.map(([playerId, net, buyIn, minutes]) => ({
      playerId,
      net: MinorUnits.make(net),
      buyIn: MinorUnits.make(buyIn ?? 10000),
      milliseconds: (minutes ?? 60) * 60_000,
    })),
  };
};

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

const shown = (
  plays: GroupStats["plays"],
  trips: ReadonlyArray<Trip> = closed,
  filters: StatsFilters = {},
  options: { clock?: TripClock; privacyMode?: boolean; seats?: GroupStats["seats"] } = {},
) => {
  const input =
    options.seats === undefined ? { plays, venues } : { plays, venues, seats: options.seats };

  const view = groupStatsView(input, detailWith(trips), filters, {
    timeZone: zone,
    clock: options.clock ?? clock,
    privacyMode: options.privacyMode ?? false,
  });

  if (view.kind !== "stats") throw new Error(view.kind);

  return view;
};

const said = (line: Line) => lineText(line, ({ amount }) => `$${amount / 100}`);

const day = (n: number, hour = 20) =>
  `2026-02-${String(n).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00Z`;

describe("group stats sections", () => {
  it("shows only the hero and standings for one finished all-positive play with three players", () => {
    const view = shown([
      play(feb, day(14), [
        [me, 100],
        [sam, 200],
        [maya, 300],
      ]),
    ]);

    expect(view.hero).toMatchObject({ players: 3, tables: 1, result: 600, chart: null });
    expect(view.standings.map((row) => row.name)).toEqual(["Maya", "Sam", "Me", "Dev"]);
    expect(view.together).toBeNull();
    expect(view.tripList).toBeNull();
    expect(view.habits).toBeNull();
    expect(view.records).toBeNull();
    expect(view.byGame).toBeNull();
    expect(view.byCasino).toBeNull();
    expect(view.awards).toBeNull();
    expect(view.byReturn).toBeNull();
  });

  describe("hero", () => {
    it("says where you stand, with a shared rank shown as =", () => {
      const view = shown([
        play(feb, day(14), [
          [me, 100],
          [sam, 100],
          [maya, 50],
        ]),
      ]);

      expect(view.hero.place).toEqual({ label: "=1st", of: 3 });
      expect(view.hero.yours).toBe(100);
      expect(view.footnote && said(view.footnote)).toBe("You're tied for first");
    });

    it("has no place or result for someone with no play", () => {
      const view = shown([play(feb, day(14), [[sam, 100]])]);

      expect(view.hero).toMatchObject({ place: null, yours: null });
      expect(view.footnote).toBeNull();
    });

    it("says how far behind the player ahead of you, and names everyone tied there", () => {
      const view = shown([
        play(feb, day(14), [
          [me, 100],
          [sam, 400],
          [maya, 400],
          [dev, 700],
        ]),
      ]);

      expect(view.hero.place).toEqual({ label: "4th", of: 4 });
      expect(said(view.footnote!)).toBe("You're 4th, $3 behind Sam and Maya");

      const front = shown([
        play(feb, day(14), [
          [me, 900],
          [sam, 400],
        ]),
      ]);

      expect(said(front.footnote!)).toBe("You're in front");
    });

    it("counts up trips among the finished ones only", () => {
      const view = shown(
        [
          play(feb, day(14), [
            [me, 100],
            [sam, -50],
          ]),
          play(mar, "2026-03-28T20:00:00Z", [
            [me, -100],
            [sam, -50],
          ]),
          play(jun, "2026-06-06T20:00:00Z", [
            [me, 500],
            [sam, 100],
          ]),
        ],
        [...closed, trip(jun, "June trip", "2026-06-05T00:00:00Z", null)],
      );

      expect(view.hero.up).toEqual({ up: 1, of: 2 });
    });

    it("draws a bar for each trip with play, oldest first, and caps them at the latest eight", () => {
      const many = Array.from({ length: 10 }, (_, i) => {
        const tripId = TripId.make(id(200 + i));

        return {
          trip: trip(
            tripId,
            `Trip ${i + 1}`,
            `2026-${String(i + 1).padStart(2, "0")}-05T00:00:00Z`,
            `2026-${String(i + 1).padStart(2, "0")}-07T00:00:00Z`,
          ),
          play: play(tripId, `2026-${String(i + 1).padStart(2, "0")}-06T20:00:00Z`, [
            [me, 100 + i],
            [sam, i],
          ]),
        };
      });

      const view = shown(
        many.map((entry) => entry.play),
        many.map((entry) => entry.trip),
      );

      expect(view.hero.chart).toMatchObject({ by: "trip", earlier: 2 });
      expect(view.hero.chart!.bars.map((bar) => bar.name)).toEqual(
        many.slice(2).map((entry) => entry.trip.name),
      );
    });

    it("leaves the leader chip off a tied trip, and puts it on a clear one", () => {
      const view = shown([
        play(feb, day(14), [
          [me, 100],
          [sam, 100],
        ]),
        play(mar, "2026-03-28T20:00:00Z", [
          [me, 100],
          [sam, 50],
        ]),
      ]);

      const [first, second] = view.hero.chart!.bars;

      expect(first!.leader).toBeNull();
      expect(second!.leader).toMatchObject({ playerId: me, label: "You" });
    });

    it("marks a trip that broke even with a marker, and a trip nobody lost as up", () => {
      const view = shown([
        play(feb, day(14), [
          [me, 100],
          [sam, -100],
        ]),
        play(mar, "2026-03-28T20:00:00Z", [
          [me, 100],
          [sam, 50],
        ]),
      ]);

      expect(view.hero.chart!.bars.map((bar) => [bar.status, bar.result])).toEqual([
        ["even", 0],
        ["up", 150],
      ]);
    });

    it("summarizes the chart with every trip, its result and its leader, and keeps amounts as amounts", () => {
      const view = shown([
        play(feb, day(14), [
          [me, 100],
          [sam, -30],
        ]),
        play(mar, "2026-03-28T20:00:00Z", [
          [me, -400],
          [sam, -50],
        ]),
      ]);

      const [first, second] = view.hero.chart!.bars;

      expect(said(first!.spoken)).toBe("Feb weekend, $0.7. You won.");
      expect(said(second!.spoken)).toBe("March trip, $-4.5. Highest result: Sam.");
      expect(first!.spoken.some((part) => !Predicate.isString(part))).toBe(true);
    });

    it("turns into the trip's nights once a trip is picked, and is no chart for one night", () => {
      const plays = [
        play(feb, "2026-02-14T22:00:00Z", [
          [me, 100],
          [sam, -30],
        ]),
        play(feb, "2026-02-15T02:00:00Z", [
          [me, -20],
          [sam, 50],
        ]),
        play(feb, "2026-02-16T20:00:00Z", [
          [me, 5],
          [sam, 5],
        ]),
      ];

      const nights = shown(plays, closed, { tripId: feb }).hero.chart!;

      expect(nights.by).toBe("night");
      expect(nights.title).toBe("By night");
      expect(nights.bars.map((bar) => [bar.status, bar.result, bar.leader?.label ?? null])).toEqual(
        [
          ["up", 100, "You"],
          ["none", 0, null],
          ["up", 10, null],
        ],
      );

      expect(shown(plays.slice(0, 2), closed, { tripId: feb }).hero.chart).toBeNull();
    });
  });

  describe("standings", () => {
    const stakes = [
      play(feb, day(10), [
        [me, 30000, 10000],
        [sam, 90000, 90000],
        [maya, -2000, 4000],
      ]),
      play(feb, day(11), [
        [me, 30000, 10000],
        [sam, 90000, 90000],
        [maya, 1000, 4000],
      ]),
      play(feb, day(12), [
        [me, 30000, 10000],
        [sam, 90000, 90000],
        [maya, 1000, 4000],
        [dev, 9999, 100],
      ]),
    ];

    it("ranks return across mixed stakes, shares a rank between equal ratios, and lists the unranked after", () => {
      const view = shown(stakes);

      expect(view.standings.map((row) => row.name)).toEqual(["Sam", "Me", "Dev", "Maya"]);
      expect(view.byReturn!.map((row) => [row.name, row.rank, row.rate?.label ?? null])).toEqual([
        ["Me", 1, "+300%"],
        ["Sam", 2, "+100%"],
        ["Maya", 3, "0%"],
        ["Dev", null, null],
      ]);

      const tied = shown([
        ...stakes.slice(0, 2),
        play(feb, day(12), [
          [me, 30000, 10000],
          [sam, 90000, 90000],
          [maya, 1000, 4000],
        ]),
      ]);

      expect(tied.byReturn!.map((row) => [row.name, row.rank])).toContainEqual(["Me", 1]);
    });

    it("shares first when two ratios are equal", () => {
      const view = shown(
        [10, 11, 12].map((n) =>
          play(feb, day(n), [
            [me, 5000, 10000],
            [sam, 50000, 100000],
            [maya, 1, 10000],
          ]),
        ),
      );

      expect(view.byReturn!.map((row) => [row.name, row.rank])).toEqual([
        ["Me", 1],
        ["Sam", 1],
        ["Maya", 3],
        ["Dev", null],
      ]);
    });

    it("hides the switch when fewer than two players qualify, and keeps the hero place on Result", () => {
      const view = shown(stakes.slice(0, 2));

      expect(view.byReturn).toBeNull();
      expect(view.hero.place).toMatchObject({ of: 3 });
    });
  });

  describe("together", () => {
    const withSam = (n: number, withoutSam = 0) => [
      ...Array.from({ length: n }, (_, i) =>
        play(feb, day(1 + i), [
          [me, 200],
          [sam, 100],
        ]),
      ),
      ...Array.from({ length: withoutSam }, (_, i) => play(feb, day(10 + i), [[me, 100]])),
    ];

    it("shows each row only at or above its floor: four and five qualifying plays", () => {
      const four = shown(withSam(4, 5));
      const five = shown(withSam(5, 5));

      expect(four.together!.map((row) => row.key)).toEqual(["pair", "sweep"]);
      expect(five.together!.map((row) => row.key)).toEqual([
        "pair",
        "with",
        "versus",
        "sweep",
        "split",
      ]);
    });

    it("words each row, with amounts as amounts", () => {
      const rows = shown(withSam(5, 5)).together!;
      const text = (key: string) => said(rows.find((row) => row.key === key)!.line);

      expect(rows.find((row) => row.key === "pair")).toMatchObject({ title: "You and Sam" });
      expect(text("pair")).toBe("5 tables together");
      expect(text("with")).toBe("You averaged $2 with Sam (5), $1 without (5)");
      expect(text("versus")).toBe("Finished higher: you 5, Sam 0, 0 tied.");
      expect(text("sweep")).toBe("5 tables · best: Blackjack · Wynn · Feb 5");
      expect(text("split")).toBe(
        "Averaged $1.5 an appearance at shared tables (5), $1 with one recorded group player (5)",
      );
    });
  });

  describe("trips", () => {
    const duel = (a: number, b: number) =>
      [
        [me, a],
        [sam, b],
      ] as const;

    const two = (first: ReadonlyArray<Seat>, second: ReadonlyArray<Seat>) => [
      play(feb, day(14), first),
      play(mar, "2026-03-28T20:00:00Z", second),
    ];

    it("lists ended trips newest first, with the winner and their result", () => {
      const list = shown(two(duel(100, 0), duel(0, 300))).tripList!;

      expect(list.rows.map((row) => [row.name, said(row.line), row.result])).toEqual([
        ["March trip", "Sam won $3 · 1 table", 300],
        ["Feb weekend", "You won $1 · 1 table", 100],
      ]);
      expect(list.wins).toBeNull();
      expect(list.all).toBeNull();
    });

    it("reads Highest result for a trip nobody won money on", () => {
      const list = shown(two(duel(-300, -40), duel(10, 0))).tripList!;

      expect(said(list.rows[1]!.line)).toBe("Highest result: Sam $-0.4 · 1 table");
    });

    it("shows a two-way tie as the pair and says who tied", () => {
      const list = shown(two(duel(100, 100), duel(0, 300))).tripList!;

      expect(said(list.rows[1]!.line)).toBe("You and Sam tied · 1 table");
      expect(list.rows[1]!.leaders.map((leader) => leader.label)).toEqual(["You", "Sam"]);
    });

    it("lists an active trip first as leading so far, and counts it as no win", () => {
      const view = shown(
        [...two(duel(100, 0), duel(100, 0)), play(jun, "2026-06-06T20:00:00Z", duel(0, 700))],
        [...closed, trip(jun, "June trip", "2026-06-05T00:00:00Z", null)],
      );

      const list = view.tripList!;

      expect(list.rows.map((row) => row.name)).toEqual(["June trip", "March trip", "Feb weekend"]);
      expect(said(list.rows[0]!.line)).toBe("Leading so far: Sam $7 · 1 table");
      expect(list.wins).toBe("You won 2 of 2");
    });

    it("lists a reopened trip the same way", () => {
      const reopened = [closed[0]!, trip(mar, "March trip", "2026-03-27T00:00:00Z", null)];

      const list = shown(two(duel(100, 0), duel(0, 300)), reopened).tripList!;

      expect(said(list.rows[0]!.line)).toBe("Leading so far: Sam $3 · 1 table");
      expect(list.wins).toBeNull();
    });

    it("lists four rows, then all of them behind All N trips", () => {
      const ids = Array.from({ length: 6 }, (_, i) => TripId.make(id(300 + i)));

      const trips = ids.map((tripId, i) =>
        trip(tripId, `Trip ${i + 1}`, `2026-0${i + 1}-02T00:00:00Z`, `2026-0${i + 1}-04T00:00:00Z`),
      );

      const view = shown(
        ids.map((tripId, i) => play(tripId, `2026-0${i + 1}-03T20:00:00Z`, duel(100 + i, i))),
        trips,
      );

      expect(view.tripList!.rows).toHaveLength(4);
      expect(view.tripList!.all).toHaveLength(6);
      expect(view.tripList!.wins).toBe("You won 6 of 6");
    });

    it("counts a trip with one player in its chart but not in the list", () => {
      const view = shown([
        play(feb, day(14), [[me, 100]]),
        play(mar, "2026-03-28T20:00:00Z", duel(5, 6)),
      ]);

      expect(view.hero.chart!.bars.map((bar) => bar.leader)).toEqual([null, expect.anything()]);
      expect(view.tripList).toBeNull();
    });

    it("says top in the slice, not won, with a game or casino applied", () => {
      const view = shown(two(duel(100, 0), duel(0, 300)), closed, { game: "blackjack" });

      expect(said(view.tripList!.rows[0]!.line)).toBe("Top in Blackjack: Sam $3 · 1 table");
      expect(view.tripList).toMatchObject({ wins: null });
      expect(said(view.hero.chart!.bars[0]!.spoken)).toContain("Top in Blackjack: You");
    });

    it("gives way to a trip's awards once the trip is picked", () => {
      const view = shown(
        [play(feb, day(14), duel(100, 0)), play(feb, "2026-02-15T20:00:00Z", duel(-5, 50))],
        closed,
        { tripId: feb },
      );

      expect(view.tripList).toBeNull();
      expect(view.awards!.length).toBeGreaterThan(0);
      expect(shown([play(feb, day(14), duel(100, 0))], closed, { tripId: feb }).awards).toBeNull();
    });
  });

  describe("habits", () => {
    const rows = (hours: ReadonlyArray<number>, net: number) =>
      hours.map((hour, i) =>
        play(
          feb,
          `2026-02-${String(1 + i).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00Z`,
          [
            [me, net],
            [sam, net],
          ],
        ),
      );

    it("compares after-midnight starts with the rest, hidden below five appearances and three plays", () => {
      const late = rows([0, 3, 5], 300);

      const rest = rows([12, 14, 16], -100).map((p, i) => ({
        ...p,
        startedAt: at(`2026-02-${10 + i}T${12 + i}:00:00Z`),
      }));

      const view = shown([...late, ...rest]);

      expect(view.habits).toHaveLength(1);
      expect(view.habits![0]!.title).toBe("After midnight");
      expect(said(view.habits![0]!.line)).toBe(
        "Averaged $3 an appearance after midnight (6), $-1 at other start times (6)",
      );
      expect(said(view.habits![0]!.trailing!)).toBe("$18");
      expect(shown([...late.slice(0, 2), ...rest]).habits).toBeNull();
    });

    it("starts the late side at 00:00 and ends it before 06:00", () => {
      const starts = (times: ReadonlyArray<string>) =>
        times.map((time) =>
          play(feb, time, [
            [me, 10],
            [sam, 10],
          ]),
        );

      const rest = starts(["2026-02-20T12:00:00Z", "2026-02-21T12:00:00Z", "2026-02-22T12:00:00Z"]);

      const view = shown([
        ...starts([
          "2026-02-01T00:00:00Z",
          "2026-02-02T05:59:00Z",
          "2026-02-03T03:00:00Z",
          "2026-02-04T06:00:00Z",
        ]),
        ...rest,
      ]);

      expect(said(view.habits![0]!.line)).toContain("after midnight (6)");
      expect(said(view.habits![0]!.line)).toContain("at other start times (8)");
    });
  });

  describe("records", () => {
    it("shows with two plays, each with its player, game and date", () => {
      const view = shown([
        play(feb, day(14), [
          [me, 700, 10000, 30],
          [sam, -900, 10000, 240],
        ]),
        play(
          feb,
          day(15),
          [
            [me, 100, 10000, 60],
            [sam, 100, 10000, 60],
          ],
          "craps",
        ),
      ]);

      expect(view.records!.map((row) => [row.title, said(row.line), said(row.trailing!)])).toEqual([
        ["Biggest win", "You · Blackjack · Feb 14", "$7"],
        ["Biggest loss", "Sam · Blackjack · Feb 14", "$-9"],
        ["Most time at one table", "Sam · Blackjack · Feb 14", "4h"],
      ]);
    });

    it("hides with one play", () => {
      expect(shown([play(feb, day(14), [[me, 700]])]).records).toBeNull();
    });

    it("shows best per hour from ten hours played", () => {
      const view = shown([
        play(feb, day(14), [
          [me, 1000, 10000, 600],
          [sam, 5000, 10000, 30],
        ]),
        play(feb, day(15), [[me, 1000, 10000, 60]]),
      ]);

      const hourly = view.records!.find((row) => row.key === "hourly")!;

      expect(hourly.people[0]!.label).toBe("You");
      expect(said(hourly.line)).toBe("You · 11h played");
      expect(said(hourly.trailing!)).toBe("$1.82/hr");
    });
  });

  describe("by game and by casino", () => {
    it("lists tables and appearances, and hides with one play", () => {
      const view = shown([
        play(feb, day(14), [
          [me, 100],
          [sam, 50],
        ]),
        play(feb, day(15), [[me, 100]], "craps"),
      ]);

      expect(view.byGame!.map((row) => [row.label, row.meta])).toEqual([
        ["Blackjack", "1 table · 2 appearances"],
        ["Craps", "1 table · 1 appearance"],
      ]);
      expect(view.byCasino!.map((row) => row.meta)).toEqual(["2 tables · 3 appearances"]);
      expect(shown([play(feb, day(14), [[me, 1]])]).byGame).toBeNull();
    });
  });

  describe("by seat", () => {
    it("shows blackjack seats spatially with partial count, hides when seats absent or non-blackjack, and ignores seat filter", () => {
      const bj1 = play(feb, day(14), [
        [me, 500, 10000, 60],
        [sam, -200, 10000, 60],
      ]);

      const bj2 = play(feb, day(15), [[maya, 300, 10000, 120]]);
      const craps = play(feb, day(16), [[me, 400, 10000, 60]], "craps");

      const seats: NonNullable<GroupStats["seats"]> = [
        {
          playId: bj1.id,
          playerId: me,
          seat: "multiple",
          net: MinorUnits.make(500),
          milliseconds: 3_600_000,
        },
        {
          playId: bj2.id,
          playerId: maya,
          seat: 1,
          net: MinorUnits.make(300),
          milliseconds: 7_200_000,
        },
      ];

      const view = shown([bj1, bj2, craps], closed, {}, { seats });

      expect(view.bySeat).toEqual({
        count: "2 of 3 blackjack plays",
        rows: [
          {
            key: "1",
            label: "Seat 1 · First base",
            meta: "1 play · 2h",
            result: MinorUnits.make(300),
          },
          {
            key: "multiple",
            label: "Multiple seats",
            meta: "1 play · 1h",
            result: MinorUnits.make(500),
          },
        ],
      });

      const full = shown(
        [bj1, bj2],
        closed,
        { seat: 1 },
        {
          seats: [
            ...seats,
            {
              playId: bj1.id,
              playerId: sam,
              seat: 5,
              net: MinorUnits.make(-200),
              milliseconds: 3_600_000,
            },
          ],
        },
      );

      expect(full.bySeat?.count).toBeUndefined();
      expect(full.bySeat?.rows.map((row) => row.key)).toEqual(["1", "5", "multiple"]);
      expect(full.chips.some((chip) => chip.key === "seat")).toBe(false);

      expect(shown([bj1, bj2, craps], closed, {}, {}).bySeat).toBeNull();
      expect(shown([bj1, bj2, craps], closed, { game: "craps" }, { seats }).bySeat).toBeNull();
    });
  });

  it("keeps every amount in a sentence a whole number of minor units", () => {
    const view = shown(
      Array.from({ length: 5 }, (_, i) =>
        play(feb, day(1 + i), [
          [me, 101],
          [sam, 100],
          [maya, 7],
        ]),
      ),
    );

    const lines = [
      ...view.together!.flatMap((row) => [row.line, row.trailing ?? []]),
      ...(view.footnote ? [view.footnote] : []),
    ];

    const amounts = lines.flatMap((line) =>
      line.flatMap((part) => (Predicate.isString(part) ? [] : [part.amount])),
    );

    expect(amounts.length).toBeGreaterThan(0);

    for (const amount of amounts) expect(Number.isInteger(amount)).toBe(true);
  });
});
