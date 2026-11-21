import { describe, expect, it } from "@effect/vitest";
import { TripId, VenueId, type Game } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";

import { makeRecordingStore, type RecordingInput, type RecordingStore } from "./recording.ts";
import type { RecordingStorageDocument } from "./recordingStorage.ts";
import { recordingHome } from "./recordingView.ts";
import { formatHours, personalStatsView, sessionShare, type StatsFilters } from "./stats.ts";

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

const view = (visits: Awaited<ReturnType<typeof played>>, filters: StatsFilters = {}) =>
  personalStatsView(visits, filters, { timeZone: zone });

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
    expect(stats.list![0]!.meta).toContain("Dec 31, 2025");

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
    expect(stats.list![0]!.meta).toMatch(/ · 0m$/);
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
    expect(stats.winRateLine).toBe("2 of 5");
    expect(stats.chart?.points.map((point) => point.total)).toEqual([
      20_000, 20_000, -20_000, -17_500, -27_500,
    ]);
    expect(stats.list).toBeNull();
  });

  it("breaks results down by game, and by casino played most then best", async () => {
    const stats = view(await played(week));

    if (stats.kind !== "stats") throw new Error(stats.kind);
    expect(stats.byGame?.map((row) => [row.label, row.result, row.share, row.chip])).toEqual([
      ["Baccarat", 2_500, 2_500 / 30_000, "purple"],
      ["Craps", 0, 0, "red"],
      ["Blackjack", -30_000, 1, "black"],
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
    expect(stats.chart?.androidAxis).toEqual({ from: "Jan", to: "Dec" });
    expect(stats.list).toHaveLength(3);
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

  it("lists a few sessions instead of drawing a line through them", async () => {
    const stats = view(await played(week), { venueId: wynn });

    if (stats.kind !== "stats") throw new Error(stats.kind);
    expect(stats.chart).toBeNull();
    expect(stats.list?.map((row) => [row.title, row.result, row.chip])).toEqual([
      ["Blackjack", -10_000, "black"],
      ["Craps", 0, "red"],
      ["Blackjack", 20_000, "black"],
    ]);
    expect(stats.list?.[1]?.meta).toMatch(/2025 · 1h 30m$/);
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
