import { describe, expect, it } from "@effect/vitest";
import { TripId, VenueId, type Game } from "@stacks/contracts";
import type { SeatBucket } from "@stacks/shared/seats";
import * as DateTime from "effect/DateTime";

import { makeRecordingStore, type RecordingInput, type RecordingStore } from "./recording.ts";
import type { RecordingStorageDocument } from "./recordingStorage.ts";
import { recordingHome } from "./recordingView.ts";
import {
  axisLabelled,
  formatHours,
  personalStatsView,
  returnFigure,
  sessionShare,
  type StatsFilters,
} from "./stats.ts";

const zone = DateTime.zoneMakeNamedUnsafe("America/Los_Angeles");
const wynn = VenueId.make("0192e7a0-0000-7000-8000-0000000000d1");
const aria = VenueId.make("0192e7a0-0000-7000-8000-0000000000d2");

const open = async () => {
  let document: RecordingStorageDocument = { revision: 0 };

  const store = makeRecordingStore({
    load: async () => document,
    commit: async (expected, payload) => {
      document = { revision: expected + 1, payload };

      return document.revision;
    },
    subscribe: () => () => undefined,
    close: async () => undefined,
  });

  await store.ready;

  return store;
};

const save = (store: RecordingStore, input: RecordingInput) => store.execute(store.prepare(input));

type Played = {
  day: string;
  hours: number;
  buyIn: number;
  cashOut: number;
  game?: Game;
  venueId?: VenueId;
};

const played = async (sessions: ReadonlyArray<Played>, live = false) => {
  const store = await open();

  for (const { day, hours, buyIn, cashOut, game, venueId } of sessions) {
    const startedAt = DateTime.makeUnsafe(`${day}T20:00:00.000Z`);

    const recorded = {
      type: "record_completed" as const,
      buyIn,
      cashOut,
      startedAt,
      finishedAt: DateTime.add(startedAt, { minutes: hours * 60 }),
    };

    const withGame = game ? { ...recorded, game } : recorded;
    await save(store, venueId ? { ...withGame, venueId } : withGame);
  }

  if (live) await save(store, { type: "start", buyIn: 99_900, game: "slots", venueId: aria });
  const home = recordingHome(store.getSnapshot().state!);

  return [...home.active, ...home.finished];
};

const NOW = DateTime.makeUnsafe("2026-11-23T12:00:00Z");

const view = (visits: Awaited<ReturnType<typeof played>>, filters: StatsFilters = {}) =>
  personalStatsView(visits, filters, { timeZone: zone, now: NOW });

const week: ReadonlyArray<Played> = [
  { day: "2025-03-01", hours: 2, buyIn: 30_000, cashOut: 50_000, game: "blackjack", venueId: wynn },
  { day: "2025-03-02", hours: 1.5, buyIn: 20_000, cashOut: 20_000, game: "craps", venueId: wynn },
  { day: "2026-01-10", hours: 3, buyIn: 50_000, cashOut: 10_000, game: "blackjack", venueId: aria },
  { day: "2026-01-11", hours: 0.5, buyIn: 10_000, cashOut: 12_500, game: "baccarat" },
  { day: "2026-02-01", hours: 1, buyIn: 10_000, cashOut: 0, game: "blackjack", venueId: wynn },
];

describe("the trip chip", () => {
  const vegas = TripId.make("0192e7a0-0000-7000-8000-0000000000e1");
  const reno = TripId.make("0192e7a0-0000-7000-8000-0000000000e2");

  const inTrips = async () =>
    (await played(week)).map((item) => {
      const day = DateTime.formatIso(item.visit.startedAt).slice(0, 10);
      const tripId = day.startsWith("2025") ? vegas : day === "2026-01-10" ? reno : null;

      return { ...item, table: { ...item.table, tripId } };
    });

  const tripNames = new Map([[vegas, "Vegas"]]);

  it("appears only once a session belongs to a trip", async () => {
    expect(view(await played(week)).chips.map((chip) => chip.key)).not.toContain("tripId");
    const trip = view(await inTrips()).chips.find((chip) => chip.key === "tripId")!;
    expect(trip.options.map((option) => option.label)).toEqual([
      "All trips",
      "Group trip",
      "Group trip",
    ]);
  });

  it("shows the whole trip in place of the period, named when the name is known", async () => {
    const visits = await inTrips();
    const all = personalStatsView(visits, { year: 2026 }, { timeZone: zone, tripNames });

    const vegasOption = all.chips
      .find((chip) => chip.key === "tripId")!
      .options.find((option) => option.label === "Vegas")!;

    expect(vegasOption.filters).toEqual({ year: undefined, tripId: vegas });
    const stats = personalStatsView(visits, vegasOption.filters, { timeZone: zone, tripNames });
    expect(stats.chips.map((chip) => chip.key)).toEqual(["tripId", "game", "venueId"]);
    expect(stats.kind === "stats" && [stats.title, stats.result, stats.sessions]).toEqual([
      "Result · Vegas",
      20_000,
      2,
    ]);
    const cleared = personalStatsView(visits, stats.chips[0]!.cleared, { timeZone: zone });
    expect(cleared.chips.map((chip) => [chip.key, chip.applied])).toEqual([
      ["year", false],
      ["game", false],
      ["venueId", false],
      ["tripId", false],
    ]);
  });

  it("counts a whole trip with the game and casino still applied", async () => {
    const visits = await inTrips();

    const before = personalStatsView(
      visits,
      { year: 2026, venueId: wynn, game: "blackjack" },
      {
        timeZone: zone,
        tripNames,
      },
    );

    const option = before.chips
      .find((chip) => chip.key === "tripId")!
      .options.find((option) => option.value === vegas)!;

    expect(before.trips.total).toBe(2);
    expect(before.trips.byId.get(vegas)).toEqual({ sessions: 1, range: "Mar 1–2, 2025" });
    expect(before.trips.byId.get(reno)?.sessions).toBe(0);
    expect(option.filters).toEqual({
      venueId: wynn,
      game: "blackjack",
      tripId: vegas,
      year: undefined,
    });
    expect(personalStatsView(visits, option.filters, { timeZone: zone })).toMatchObject({
      kind: "stats",
      sessions: 1,
    });
  });

  it("says which trip matched nothing", async () => {
    const stats = personalStatsView(
      await inTrips(),
      { tripId: vegas, game: "baccarat" },
      { timeZone: zone, tripNames },
    );

    expect(stats.kind === "no_match" && stats.sentence).toBe(
      "No finished Baccarat sessions on Vegas.",
    );
  });
});

describe("sessionShare", () => {
  it("measures each row against the sessions its breakdown covers", () => {
    const byCasino = [{ sessionCount: 2 }, { sessionCount: 1 }];
    const share = sessionShare(byCasino);
    expect(byCasino.map(share)).toEqual([2 / 3, 1 / 3]);
    expect(sessionShare([])({ sessionCount: 0 })).toBe(0);
  });
});

describe("formatHours", () => {
  it("says hours like a session does, dropping zero minutes", () => {
    expect(formatHours(0)).toBe("0m");
    expect(formatHours(0.75)).toBe("45m");
    expect(formatHours(6)).toBe("6h");
    expect(formatHours(38.5)).toBe("38h 30m");
    expect(formatHours(1.09)).toBe("1h 05m");
  });
});

describe("personalStatsView", () => {
  it("keeps selected filters visible after their last matching session disappears", async () => {
    const visits = await played(week);
    const filters = { year: 2025, game: "craps" as const, venueId: null };
    const updated = visits.filter((item) => item.table.game !== "craps");
    const stats = view(updated, filters);
    const selected = stats.chips.find((chip) => chip.key === "game")!;
    expect(selected.label).toBe("Craps");
    expect(selected.value).toBe("craps");
    expect(selected.options.find((option) => option.value === "craps")?.filters).toEqual(filters);
    const empty = view([], filters);
    expect(empty.chips.map((chip) => chip.label)).toEqual(["2025", "Craps", "No casino set"]);
  });

  it("formats session dates in the same timezone as the period filter", async () => {
    const visits = await played([{ day: "2025-12-31", hours: 5, buyIn: 10000, cashOut: 12000 }]);
    const stats = view(visits, { year: 2025 });

    if (stats.kind !== "stats") throw new Error(stats.kind);
    expect(stats.chart).toBeNull();
    expect(stats.records[0]!.meta).toBe("Session · Dec 31, 2025");

    const chart = view(
      await played(
        [28, 29, 30, 31].map((day) => ({
          day: `2025-12-${day}`,
          hours: 5,
          buyIn: 10000,
          cashOut: 12000,
        })),
      ),
    );

    if (chart.kind !== "stats") throw new Error(chart.kind);
    expect(chart.chart!.points.at(-1)!.day).toBe("Dec 31, 2025");
    expect(chart.chart!.from).toBe("Dec 28, 2025");
    expect(chart.chart!.to).toBe("Dec 31, 2025");
  });

  it("uses unrounded elapsed time for duration labels", async () => {
    const visits = await played([
      { day: "2026-01-01", hours: 29 / 3600, buyIn: 10000, cashOut: 12000 },
    ]);

    const stats = view(visits);

    if (stats.kind !== "stats") throw new Error(stats.kind);
    expect(stats.hours).toBe("0m");
    expect(stats.byGame![0]!.meta).toBe("1 session · 0m");
    expect(stats.byCasino![0]!.meta).toBe("1 session · 0m");
  });

  it("uses offline casino names in filters, breakdowns and no-match text", async () => {
    const visits = (await played(week)).map((item) => ({
      ...item,
      venue:
        item.table.venueId === wynn
          ? {
              id: wynn,
              name: "Wynn",
              kind: "casino" as const,
              city: "Las Vegas",
              region: "NV",
              country: "US",
              lat: 36.127,
              lng: -115.164,
            }
          : null,
    }));

    const all = view(visits);

    if (all.kind !== "stats") throw new Error(all.kind);
    expect(
      all.chips.find((chip) => chip.key === "venueId")!.options.map((option) => option.label),
    ).toContain("Wynn");
    expect(all.byCasino!.find((row) => row.key === wynn)!.label).toBe("Wynn");
    expect(all.byCasino!.find((row) => row.key === aria)!.label).toBe("Casino");
    const empty = view(visits, { venueId: wynn, game: "roulette" });

    if (empty.kind !== "no_match") throw new Error(empty.kind);
    expect(empty.sentence).toContain("at Wynn");
  });

  it("is empty with no finished sessions, even while one is live", async () => {
    const stats = view(await played([], true));
    expect(stats.kind).toBe("empty");
    expect(stats.chips.map((chip) => chip.label)).toEqual(["All time", "All games", "All casinos"]);
    expect(stats.filtered).toBe(false);
  });

  it("sums finished sessions only, and counts break-even in the win rate's total", async () => {
    const stats = view(await played(week, true));

    if (stats.kind !== "stats") throw new Error(stats.kind);
    expect(stats.title).toBe("Result · all time");
    expect(stats.result).toBe(20_000 + 0 - 40_000 + 2_500 - 10_000);
    expect(stats.sessions).toBe(5);
    expect(stats.hours).toBe("8h");
    expect(stats.hourlyResult).toBe(-3_438);
    expect(stats.winRate).toBe("40%");
    expect(stats.chart?.points.map((point) => point.total)).toEqual([
      20_000, 20_000, -20_000, -17_500, -27_500,
    ]);
  });

  it("breaks results down by game, and by casino played most then best", async () => {
    const stats = view(await played(week));

    if (stats.kind !== "stats") throw new Error(stats.kind);
    expect(stats.byGame?.map((row) => [row.label, row.result, row.chip])).toEqual([
      ["Baccarat", 2_500, "purple"],
      ["Craps", 0, "red"],
      ["Blackjack", -30_000, "black"],
    ]);
    expect(stats.byGame?.[2]?.meta).toBe("3 sessions · 6h");
    expect(stats.byCasino?.map((row) => [row.key, row.meta, row.result])).toEqual([
      [wynn, "3 sessions · 4h 30m", 10_000],
      ["none", "1 session · 30m", 2_500],
      [aria, "1 session · 3h", -40_000],
    ]);
    expect(stats.byCasino?.[1]?.label).toBe("No casino set");
  });

  it("filters by period, game and casino, and drops the breakdown it's filtered by", async () => {
    const visits = await played(week);
    const all = view(visits);
    const year = all.chips.find((chip) => chip.key === "year")!;
    expect(year.options.map((option) => option.label)).toEqual(["All time", "2026", "2025"]);

    const stats = view(visits, year.options[1]!.filters);

    if (stats.kind !== "stats") throw new Error(stats.kind);
    expect(stats.title).toBe("Result · 2026");
    expect(stats.result).toBe(-40_000 + 2_500 - 10_000);
    expect(stats.chart?.points).toHaveLength(3);
    expect(stats.chart?.from).toBe("Jan 10");
    expect(stats.chart?.to).toBe("Feb 1");
    expect(stats.chips.map((chip) => [chip.label, chip.applied])).toEqual([
      ["2026", true],
      ["All games", false],
      ["All casinos", false],
    ]);
    expect(stats.filtered).toBe(true);

    const blackjack = view(
      visits,
      stats.chips[1]!.options.find((option) => option.label === "Blackjack")!.filters,
    );

    if (blackjack.kind !== "stats") throw new Error(blackjack.kind);
    expect(blackjack.chart?.points).toHaveLength(2);
    expect(blackjack.chips[1]!.label).toBe("Blackjack");
    expect(blackjack.byGame).toBeNull();
    expect(blackjack.byCasino).not.toBeNull();
    expect(view(visits, blackjack.chips[0]!.cleared).chips[0]!.label).toBe("Blackjack");

    const atWynn = view(visits, all.kind === "stats" ? all.byCasino![0]!.filters : {});

    if (atWynn.kind !== "stats") throw new Error(atWynn.kind);
    expect(atWynn.byCasino).toBeNull();
    expect(atWynn.chips[0]!.label).toBe("Casino");
  });

  it("draws no line through a single session", async () => {
    const stats = view(await played(week), { venueId: aria });

    if (stats.kind !== "stats") throw new Error(stats.kind);
    expect(stats.chart).toBeNull();
    expect(stats.bars).toBeNull();
    expect(stats.patterns).toEqual([]);
    expect(stats.climb).toBeNull();
    expect(stats.records.map((row) => [row.key, row.label, row.result])).toEqual([
      ["loss", "Biggest loss", -40_000],
    ]);
  });

  it("says what matched nothing", async () => {
    const visits = await played(week);
    const stats = view(visits, { year: 2025, game: "baccarat", venueId: wynn });
    expect(stats.kind).toBe("no_match");

    if (stats.kind !== "no_match") return;
    expect(stats.sentence).toBe("No finished Baccarat sessions at Casino in 2025.");
    expect(stats.chips.every((chip) => chip.applied)).toBe(true);
    const unset = view(visits, { year: 2025, venueId: null });
    expect(unset.kind === "no_match" && unset.sentence).toBe(
      "No finished sessions in 2025 without a casino set.",
    );
  });

  it("matches the finished results for every combination of filters", async () => {
    const visits = await played(week, true);
    const finished = visits.filter((item) => item.finalResult !== null);

    const yearOf = (item: (typeof visits)[number]) =>
      DateTime.toParts(DateTime.setZone(item.visit.finishedAt!, zone)).year;

    const chips = view(visits).chips;

    for (const year of chips[0]!.options)
      for (const game of chips[1]!.options)
        for (const casino of chips[2]!.options) {
          const filters = { ...year.filters, ...game.filters, ...casino.filters };

          const matching = finished.filter(
            (item) =>
              (filters.year === undefined || yearOf(item) === filters.year) &&
              (filters.game === undefined || item.table.game === filters.game) &&
              (filters.venueId === undefined || item.table.venueId === filters.venueId),
          );

          const stats = view(visits, filters);
          expect(stats.kind).toBe(matching.length ? "stats" : "no_match");

          if (stats.kind !== "stats") continue;
          expect(stats.result).toBe(matching.reduce((sum, item) => sum + item.finalResult!, 0));
          expect(stats.sessions).toBe(matching.length);
        }
  });
});

describe("returnFigure", () => {
  it("words the return and colors it by the figure it prints", () => {
    expect(returnFigure(5_500, 10_000)).toEqual({ label: "+55%", tone: "win" });
    expect(returnFigure(-3_000, 10_000)).toEqual({ label: "-30%", tone: "loss" });
    expect(returnFigure(0, 10_000)).toEqual({ label: "0%", tone: "even" });
  });

  it("stays muted when it rounds to nothing", () => {
    expect(returnFigure(40, 10_000)).toEqual({ label: "0%", tone: "even" });
    expect(returnFigure(-40, 10_000)).toEqual({ label: "0%", tone: "even" });
  });

  it("has nothing to measure against with no buy-ins", () => {
    expect(returnFigure(2_500, 0)).toEqual({ label: "–", tone: "none" });
    expect(returnFigure(0, 0)).toEqual({ label: "–", tone: "none" });
  });
});

describe("the Just me figures", () => {
  const stats = async (sessions: ReadonlyArray<Played>, filters: StatsFilters = {}) => {
    const result = view(await played(sessions), filters);

    if (result.kind !== "stats") throw new Error(result.kind);

    return result;
  };

  it("scopes the hero, and says the sessions and time behind it", async () => {
    const all = await stats(week);
    expect(all.title).toBe("Result · all time");
    expect(all.played).toBe("5 sessions · 8h");
    expect(all.returnRate).toEqual({ label: "-23%", tone: "loss" });
    expect((await stats(week, { year: 2026 })).title).toBe("Result · 2026");
  });

  it("has no per-hour figure when no time elapsed, but keeps the result", async () => {
    const result = await stats([{ day: "2026-01-10", hours: 0, buyIn: 10_000, cashOut: 15_000 }]);
    expect(result.result).toBe(5_000);
    expect(result.hourlyResult).toBeNull();
    expect(result.winRate).toBe("100%");
  });

  it("measures the climb from the low", async () => {
    const result = await stats([
      { day: "2026-01-10", hours: 1, buyIn: 10_000, cashOut: 5_000 },
      { day: "2026-01-11", hours: 1, buyIn: 10_000, cashOut: 18_000 },
    ]);

    expect(result.result).toBe(3_000);
    expect(result.climb).toBe(8_000);
  });

  it("draws the line from two sessions, between the first and last dates", async () => {
    const result = await stats(week, { year: 2025 });
    expect(result.chart?.points).toHaveLength(2);
    expect([result.chart?.from, result.chart?.to]).toEqual(["Mar 1", "Mar 2"]);
    expect([result.chart?.low, result.chart?.high]).toEqual([0, 20_000]);
  });

  it("splits the money, and leaves out an adjustment of zero", async () => {
    const { money } = await stats(week);
    expect(money).toEqual({
      won: { sessions: 2, result: 22_500 },
      lost: { sessions: 2, result: -50_000 },
      even: 1,
      buyIn: 120_000,
      cashOut: 92_500,
      adjustment: null,
    });
  });

  describe("by month", () => {
    const months: ReadonlyArray<Played> = [
      { day: "2026-01-10", hours: 1, buyIn: 10_000, cashOut: 14_000 },
      { day: "2026-02-10", hours: 1, buyIn: 10_000, cashOut: 4_000 },
      { day: "2026-03-10", hours: 1, buyIn: 10_000, cashOut: 22_000 },
      { day: "2026-03-12", hours: 1, buyIn: 10_000, cashOut: 10_000 },
      { day: "2026-05-10", hours: 1, buyIn: 10_000, cashOut: 10_000 },
    ];

    it("names the best and worst month, and marks only those bars", async () => {
      const { bars } = await stats(months, { year: 2026 });

      expect(bars?.title).toBe("By month");
      expect(bars?.count).toBe("2 up · 1 down");
      expect(bars?.sentences).toEqual([
        { key: "best", before: "March was your best month at", amount: 12_000 },
        { key: "worst", before: "February was your worst at", amount: -6_000 },
      ]);
      expect(bars?.bars.filter((bar) => bar.emphasis).map((bar) => bar.name)).toEqual([
        "February",
        "March",
      ]);
    });

    it("tells won, lost, even and unplayed apart, through to the current month", async () => {
      const { bars } = await stats(months, { year: 2026 });

      expect(bars?.bars.map((bar) => bar.status)).toEqual([
        "up",
        "down",
        "up",
        "none",
        "even",
        "none",
        "none",
        "none",
        "none",
        "none",
        "none",
      ]);
      expect(bars?.summary).toBe(
        "Result by month, January to November: 2 up, 1 down, 1 even, 7 with no play.",
      );
    });

    it("puts the year on the first label and at a January in all time only", async () => {
      const older: ReadonlyArray<Played> = [
        { day: "2025-11-10", hours: 1, buyIn: 10_000, cashOut: 14_000 },
        { day: "2025-12-10", hours: 1, buyIn: 10_000, cashOut: 4_000 },
        { day: "2026-01-10", hours: 1, buyIn: 10_000, cashOut: 22_000 },
      ];

      const { bars } = await stats(older);
      expect(bars?.bars.map((bar) => [bar.label, bar.year]).slice(0, 4)).toEqual([
        ["Feb", "2025"],
        ["Mar", null],
        ["Apr", null],
        ["May", null],
      ]);
      expect(bars?.bars.find((bar) => bar.label === "Jan")?.year).toBe("2026");
      expect((await stats(older, { year: 2026 })).bars).toBeNull();
      expect((await stats([...older, ...months], { year: 2026 })).bars?.bars[0]?.year).toBeNull();
    });

    it("leaves a sentence out when the best month lost, and when two months tie", async () => {
      const losing = await stats(
        [
          { day: "2026-01-10", hours: 1, buyIn: 10_000, cashOut: 9_000 },
          { day: "2026-02-10", hours: 1, buyIn: 10_000, cashOut: 5_000 },
          { day: "2026-03-10", hours: 1, buyIn: 10_000, cashOut: 8_000 },
        ],
        { year: 2026 },
      );

      expect(losing.bars?.sentences).toEqual([
        { key: "worst", before: "February was your worst at", amount: -5_000 },
      ]);

      const tied = await stats(
        [
          { day: "2026-01-10", hours: 1, buyIn: 10_000, cashOut: 14_000 },
          { day: "2026-02-10", hours: 1, buyIn: 10_000, cashOut: 14_000 },
          { day: "2026-03-10", hours: 1, buyIn: 10_000, cashOut: 11_000 },
        ],
        { year: 2026 },
      );

      expect(tied.bars?.sentences).toEqual([]);
      expect(tied.bars?.bars.filter((bar) => bar.emphasis)).toHaveLength(2);
    });

    it("is hidden below 3 played months", async () => {
      expect((await stats(months.slice(0, 2), { year: 2026 })).bars).toBeNull();
    });
  });

  describe("by night", () => {
    const vegas = TripId.make("0192e7a0-0000-7000-8000-0000000000e1");

    const night = async (sessions: ReadonlyArray<Played>) => {
      const visits = (await played(sessions)).map((item) => ({
        ...item,
        table: { ...item.table, tripId: vegas },
      }));

      const result = view(visits, { tripId: vegas });

      if (result.kind !== "stats") throw new Error(result.kind);

      return result;
    };

    it("becomes By night for a trip, one bar per night with the gap kept", async () => {
      const { bars } = await night([
        { day: "2026-11-05", hours: 1, buyIn: 10_000, cashOut: 14_000 },
        { day: "2026-11-07", hours: 1, buyIn: 10_000, cashOut: 4_000 },
      ]);

      expect(bars?.title).toBe("By night");
      expect(bars?.bars.map((bar) => [bar.label, bar.name, bar.status])).toEqual([
        ["Thu", "Thursday, Nov 5", "up"],
        ["Fri", "Friday, Nov 6", "none"],
        ["Sat", "Saturday, Nov 7", "down"],
      ]);
      expect(bars?.sentences.map((sentence) => sentence.before)).toEqual([
        "Thursday, Nov 5 was your best night at",
        "Saturday, Nov 7 was your worst at",
      ]);
      expect(bars?.summary).toBe(
        "Result by night, Thursday, Nov 5 to Saturday, Nov 7: 1 up, 1 down, 1 with no play.",
      );
    });
  });

  describe("axis labels", () => {
    const shown = (count: number) =>
      Array.from({ length: count }, (_, index) => index).filter(axisLabelled(count));

    it("labels every column up to 18", () => {
      expect(shown(18)).toHaveLength(18);
    });

    it("thins to every other column, keeping the first and the last", () => {
      expect(shown(19)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
      expect(shown(20)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 19]);
    });

    it("thins further for a longer run, and never labels two neighbours", () => {
      for (const count of [37, 40, 55, 90]) {
        const picked = shown(count);

        expect(picked[0]).toBe(0);
        expect(picked.at(-1)).toBe(count - 1);
        expect(picked.length).toBeLessThanOrEqual(18);
        expect(picked.every((index, i) => i === 0 || index - picked[i - 1]! >= 2)).toBe(true);
      }
    });

    it("keeps every night's full name on a long trip", async () => {
      const vegas = TripId.make("0192e7a0-0000-7000-8000-0000000000e2");

      const visits = (
        await played(
          Array.from({ length: 21 }, (_, i) => ({
            day: `2026-06-${String(i + 1).padStart(2, "0")}`,
            hours: 1,
            buyIn: 10_000,
            cashOut: 12_000,
          })),
        )
      ).map((item) => ({ ...item, table: { ...item.table, tripId: vegas } }));

      const result = view(visits, { tripId: vegas });

      if (result.kind !== "stats") throw new Error(result.kind);

      const { bars } = result.bars!;

      expect(bars.map((bar) => bar.label).filter(Boolean)).toEqual([
        "1",
        "3",
        "5",
        "7",
        "9",
        "11",
        "13",
        "15",
        "17",
        "19",
        "21",
      ]);
      expect(bars.every((bar) => bar.name.length > 0)).toBe(true);
    });
  });

  describe("patterns", () => {
    const weekly = (count: number, from: string, cashOut: number, hours = 1) =>
      Array.from({ length: count }, (_, i) => ({
        day: DateTime.formatIso(DateTime.add(DateTime.makeUnsafe(from), { days: 7 * i })).slice(
          0,
          10,
        ),
        hours,
        buyIn: 10_000,
        cashOut,
      }));

    it("names the weekday with the highest average, across how many sessions", async () => {
      const { patterns } = await stats([
        ...weekly(5, "2026-01-02", 16_000),
        ...weekly(5, "2026-01-03", 8_000),
      ]);

      expect(patterns).toEqual([
        {
          key: "Fridays",
          before: "Fridays averaged",
          amount: 6_000,
          after: " a session, across 5.",
        },
      ]);
    });

    it("names the length with the highest average, whatever its sign", async () => {
      const { patterns } = await stats([
        ...weekly(5, "2026-01-02", 9_000, 0.5),
        ...weekly(5, "2026-03-13", 3_000, 4),
      ]);

      expect(patterns.map((pattern) => [pattern.before, pattern.amount, pattern.after])).toEqual([
        ["Under 1h sessions averaged", -1_000, ", across 5."],
      ]);
    });

    it("says nothing when two buckets tie, or when too few have the sessions", async () => {
      expect(
        (await stats([...weekly(5, "2026-01-02", 16_000), ...weekly(5, "2026-01-03", 16_000)]))
          .patterns,
      ).toEqual([]);
      expect(
        (await stats([...weekly(5, "2026-01-02", 16_000), ...weekly(4, "2026-01-03", 8_000)]))
          .patterns,
      ).toEqual([]);
    });
  });

  describe("records", () => {
    it("names the game, casino and date, and opens the session", async () => {
      const visits = (await played(week)).map((item) => ({
        ...item,
        venue:
          item.table.venueId === wynn
            ? {
                id: wynn,
                name: "Wynn",
                kind: "casino" as const,
                city: null,
                region: null,
                country: "US",
                lat: 0,
                lng: 0,
              }
            : null,
      }));

      const result = view(visits);

      if (result.kind !== "stats") throw new Error(result.kind);

      expect(result.records.map((row) => [row.label, row.meta, row.result])).toEqual([
        ["Biggest win", "Blackjack · Wynn · Mar 1, 2025", 20_000],
        ["Biggest loss", "Blackjack · Casino · Jan 10, 2026", -40_000],
      ]);
      expect(result.records[0]?.visitId).toBe(
        visits.find((item) => item.finalResult === 20_000)?.visit.id,
      );
    });

    it("leaves the casino out when none was set", async () => {
      const result = await stats([
        { day: "2026-01-10", hours: 1, buyIn: 10_000, cashOut: 20_000, game: "craps" },
      ]);

      expect(result.records[0]?.meta).toBe("Craps · Jan 10, 2026");
    });
  });

  describe("blackjack seats", () => {
    const seatedVisits = async (specs: ReadonlyArray<Played & { seat?: SeatBucket | null }>) => {
      const raw = (await played(specs)).toSorted(
        (a, b) =>
          DateTime.toEpochMillis(a.visit.startedAt) - DateTime.toEpochMillis(b.visit.startedAt),
      );

      return raw.map((item, index) => {
        const seat = specs[index]?.seat ?? null;

        const seatOutcome = (() => {
          if (seat === "multiple") return { kind: "multiple", seats: [1, 5] } as const;

          if (seat === null) return { kind: "none" } as const;

          return { kind: "seat", seat } as const;
        })();

        return { ...item, seatOutcome };
      });
    };

    it("orders bySeat spatially, reports partial coverage, and clears seat when leaving Blackjack", async () => {
      const visits = await seatedVisits([
        { day: "2026-01-01", hours: 1, buyIn: 10_000, cashOut: 15_000, game: "blackjack", seat: 5 },
        { day: "2026-01-02", hours: 2, buyIn: 10_000, cashOut: 22_000, game: "blackjack", seat: 1 },
        {
          day: "2026-01-03",
          hours: 1,
          buyIn: 10_000,
          cashOut: 4_000,
          game: "blackjack",
          seat: "multiple",
        },
        { day: "2026-01-04", hours: 1, buyIn: 10_000, cashOut: 11_000, game: "blackjack" },
        { day: "2026-01-05", hours: 1, buyIn: 10_000, cashOut: 14_000, game: "craps", seat: 2 },
      ]);

      const all = view(visits);

      if (all.kind !== "stats") throw new Error(all.kind);
      expect(all.chips.map((c) => c.key)).toEqual(["year", "game", "venueId"]);
      expect(all.bySeat).toEqual({
        count: "3 of 4 blackjack sessions",
        rows: [
          {
            key: "1",
            label: "Seat 1 · First base",
            meta: "1 session · 2h",
            result: 12_000,
            filters: { game: "blackjack", seat: 1 },
          },
          {
            key: "5",
            label: "Seat 5",
            meta: "1 session · 1h",
            result: 5_000,
            filters: { game: "blackjack", seat: 5 },
          },
          {
            key: "multiple",
            label: "Multiple seats",
            meta: "1 session · 1h",
            result: -6_000,
            filters: { game: "blackjack", seat: "multiple" },
          },
        ],
      });

      const seatPicked = view(visits, all.bySeat!.rows[0]!.filters);

      if (seatPicked.kind !== "stats") throw new Error(seatPicked.kind);
      expect(seatPicked.bySeat).toBeNull();
      expect(seatPicked.chips.map((c) => [c.key, c.applied, c.label])).toEqual([
        ["game", true, "Blackjack"],
        ["seat", true, "Seat 1 · First base"],
        ["year", false, "All time"],
        ["venueId", false, "All casinos"],
      ]);

      const gameChip = seatPicked.chips.find((c) => c.key === "game")!;
      expect(gameChip.cleared.seat).toBeUndefined();
      expect(gameChip.options.find((o) => o.value === "craps")?.filters.seat).toBeUndefined();
      expect(gameChip.options.find((o) => o.value === "")?.filters.seat).toBeUndefined();

      const bj = view(visits, { game: "blackjack" });
      expect(bj.chips.find((c) => c.key === "seat")?.options.map((o) => o.label)).toEqual([
        "All seats",
        "Seat 1 · First base",
        "Seat 5",
        "Multiple seats",
        "No seat recorded",
      ]);
    });

    it("formats noMatch copy for single seat, multiple seats and unset seat", async () => {
      const visits = await seatedVisits([
        { day: "2026-01-01", hours: 1, buyIn: 10_000, cashOut: 15_000, game: "blackjack", seat: 1 },
      ]);

      const three = view(visits, { year: 2026, game: "blackjack", seat: 3 });
      expect(three.kind === "no_match" && three.sentence).toBe(
        "No finished Blackjack sessions at Seat 3 in 2026.",
      );

      const multi = view(visits, { game: "blackjack", seat: "multiple" });
      expect(multi.kind === "no_match" && multi.sentence).toBe(
        "No finished Blackjack sessions across multiple seats.",
      );

      const none = view(visits, { game: "blackjack", seat: null });
      expect(none.kind === "no_match" && none.sentence).toBe(
        "No finished Blackjack sessions without a seat set.",
      );
    });

    it("emits a seat Patterns sentence only in blackjack scope, never for Multiple seats or a seat filter", async () => {
      const batch = (
        count: number,
        dayStart: number,
        cashOut: number,
        game: Game,
        seat: SeatBucket,
      ) =>
        Array.from({ length: count }, (_, i) => ({
          day: `2026-03-${String(dayStart + i).padStart(2, "0")}`,
          hours: 1,
          buyIn: 10_000,
          cashOut,
          game,
          seat,
        }));

      const visits = await seatedVisits([
        ...batch(5, 1, 24_000, "blackjack", 3),
        ...batch(5, 7, 12_000, "blackjack", 1),
        ...batch(1, 15, 20_000, "craps", 3),
      ]);

      const mixedAll = view(visits);

      if (mixedAll.kind !== "stats") throw new Error(mixedAll.kind);
      expect(mixedAll.patterns.some((p) => p.before.includes("Seat"))).toBe(false);

      const bj = view(visits, { game: "blackjack" });

      if (bj.kind !== "stats") throw new Error(bj.kind);
      expect(bj.patterns).toContainEqual({
        key: "Seat 3",
        before: "Seat 3 averaged",
        amount: 14_000,
        after: " a session, across 5.",
      });

      const filteredSeat = view(visits, { game: "blackjack", seat: 3 });

      if (filteredSeat.kind !== "stats") throw new Error(filteredSeat.kind);
      expect(filteredSeat.patterns.some((p) => p.before.includes("Seat"))).toBe(false);

      const firstBaseBest = await seatedVisits([
        ...batch(5, 1, 26_000, "blackjack", 1),
        ...batch(5, 7, 12_000, "blackjack", 3),
      ]);

      const bjOnly = view(firstBaseBest);

      if (bjOnly.kind !== "stats") throw new Error(bjOnly.kind);
      expect(bjOnly.patterns).toContainEqual({
        key: "First base (Seat 1)",
        before: "First base (Seat 1) averaged",
        amount: 16_000,
        after: " a session, across 5.",
      });
    });
  });
});
