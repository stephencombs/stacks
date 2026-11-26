import { describe, expect, it } from "@effect/vitest";
import { TableId, TripId, VenueId, type Game, type PlayerId } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";

import { ALEX, BEA, CAL, DEE, money } from "./testing/ledgerArbitrary.ts";
import { groupAwards, groupSeatBreakdown, groupStats, type GroupPlay } from "./stats.ts";
import { tripStandings, type TripClock } from "./trips.ts";

const zone = DateTime.zoneMakeNamedUnsafe("UTC");

const clock: TripClock = {
  night: (at) => new Date(DateTime.toEpochMillis(at) - 6 * 3_600_000).toISOString().slice(0, 10),
  hour: (at) => new Date(DateTime.toEpochMillis(at)).getUTCHours(),
};

const vegas = TripId.make("0192e7a0-0000-7000-8000-000000000301");
const reno = TripId.make("0192e7a0-0000-7000-8000-000000000302");
const wynn = VenueId.make("0192e7a0-0000-7000-8000-000000000401");
const bellagio = VenueId.make("0192e7a0-0000-7000-8000-000000000402");

let count = 0;

const play = (
  results: ReadonlyArray<[PlayerId, number, number?]>,
  fields: {
    at?: string;
    endedAt?: string;
    tripId?: TripId;
    game?: Game | null;
    venueId?: VenueId | null;
  } = {},
) => {
  const startedAt = DateTime.makeUnsafe(fields.at ?? "2026-10-21T20:00:00Z");

  const endedAt = DateTime.makeUnsafe(
    fields.endedAt ?? DateTime.toEpochMillis(startedAt) + 3_600_000,
  );

  return {
    id: `play-${++count}`,
    tripId: fields.tripId ?? vegas,
    game: fields.game === undefined ? "blackjack" : fields.game,
    venueId: fields.venueId === undefined ? wynn : fields.venueId,
    startedAt,
    endedAt,
    results: results.map(([playerId, net, minutes]) => ({
      playerId,
      net,
      buyIn: Math.max(0, -net),
      milliseconds: (minutes ?? 60) * 60_000,
    })),
  };
};

describe("groupStats", () => {
  it("ranks members by result, and equal results share a rank", () => {
    const stats = groupStats(
      [
        play([
          [ALEX, 500],
          [BEA, 200],
          [CAL, 200],
          [DEE, -100],
        ]),
      ],
      [DEE, CAL, BEA, ALEX],
      zone,
    );

    expect(stats.standings.map((s) => [s.playerId, s.rank, s.result])).toEqual([
      [ALEX, 1, 500],
      [CAL, 2, 200],
      [BEA, 2, 200],
      [DEE, 4, -100],
    ]);
    expect(stats.result).toBe(800);
  });

  it("lists a member with nothing in scope last, at zero and unranked", () => {
    const stats = groupStats(
      [play([[ALEX, -300]]), play([[BEA, 0]], { tripId: reno })],
      [ALEX, BEA, CAL],
      zone,
      { tripId: vegas },
    );

    expect(stats.standings.map((s) => [s.playerId, s.rank, s.result, s.sessions])).toEqual([
      [ALEX, 1, -300, 1],
      [BEA, null, 0, 0],
      [CAL, null, 0, 0],
    ]);
  });

  it("keeps a former member who played, ranked, though they're off the roster", () => {
    const stats = groupStats([play([[DEE, 100]])], [ALEX], zone);
    expect(stats.standings.map((s) => [s.playerId, s.rank])).toEqual([
      [DEE, 1],
      [ALEX, null],
    ]);
  });

  it("gives each member a stat sheet; an even session counts toward the win rate's total", () => {
    const stats = groupStats(
      [
        play([[ALEX, 900, 90]]),
        play([[ALEX, 0, 30]]),
        play([[ALEX, -300, 60]], { at: "2026-10-22T20:00:00Z" }),
      ],
      [ALEX],
      zone,
    );

    expect(stats.standings[0]).toEqual({
      playerId: ALEX,
      rank: 1,
      result: 600,
      sessions: 3,
      hours: 3,
      hourlyResult: 200,
      wins: 1,
    });
  });

  it("sums raw milliseconds for hours and hourly result, and assigns period year from endedAt", () => {
    const crossYear = play([[ALEX, 10_000]], {
      at: "2025-12-31T22:00:00Z",
      endedAt: "2026-01-01T02:00:00Z",
    });

    const subMinuteA: GroupPlay = {
      ...play([]),
      results: [{ playerId: ALEX, net: 1000, buyIn: 0, milliseconds: 29 * 60_000 + 40_000 }],
    };

    const subMinuteB: GroupPlay = {
      ...play([]),
      results: [{ playerId: ALEX, net: 1000, buyIn: 0, milliseconds: 29 * 60_000 + 40_000 }],
    };

    expect(groupStats([crossYear], [ALEX], zone).options.years).toEqual([2026]);
    const summed = groupStats([subMinuteA, subMinuteB], [ALEX], zone).standings[0]!;
    expect(summed.hours).toBe(0.99);
    expect(summed.hourlyResult).toBe(2022);
  });

  it("filters by trip, game, casino and period; a trip replaces the period", () => {
    const plays = [
      play([[ALEX, 100]]),
      play([[ALEX, 200]], { game: "craps" }),
      play([[ALEX, 400]], { venueId: bellagio }),
      play([[ALEX, 800]], { tripId: reno, at: "2025-03-01T20:00:00Z" }),
      play([[ALEX, 1600]], { game: null, venueId: null }),
    ];

    const result = (filters: Parameters<typeof groupStats>[3]) =>
      groupStats(plays, [ALEX], zone, filters).result;

    expect(result({})).toBe(3100);
    expect(result({ tripId: vegas })).toBe(2300);
    expect(result({ tripId: reno, year: 2026 })).toBe(800);
    expect(result({ year: 2025 })).toBe(800);
    expect(result({ game: "blackjack", venueId: wynn })).toBe(900);
    expect(result({ game: null, venueId: null })).toBe(1600);
    expect(groupStats(plays, [ALEX], zone, { game: "craps" }).options).toEqual({
      years: [2026, 2025],
      games: ["blackjack", "craps", null],
      venueIds: [wynn, bellagio, null].toSorted((a, b) =>
        a === null ? 1 : b === null ? -1 : a < b ? -1 : 1,
      ),
      tripIds: [vegas, reno],
    });
  });

  it("breaks the group's result down by game and casino, best first", () => {
    const stats = groupStats(
      [
        play(
          [
            [ALEX, 100],
            [BEA, -50],
          ],
          { game: "craps" },
        ),
        play([[BEA, 300]], { venueId: bellagio }),
        play([[CAL, -20]], { game: null, venueId: null }),
      ],
      [ALEX, BEA, CAL],
      zone,
    );

    expect(stats.byGame).toEqual([
      { game: "blackjack", sessions: 1, appearances: 1, result: 300 },
      { game: "craps", sessions: 1, appearances: 2, result: 50 },
      { game: null, sessions: 1, appearances: 1, result: -20 },
    ]);
    expect(stats.byCasino.map((row) => [row.venueId, row.sessions, row.result])).toEqual([
      [bellagio, 1, 300],
      [wynn, 1, 50],
      [null, 1, -20],
    ]);
  });

  it("orders plays oldest first for the running result", () => {
    const late = play([[ALEX, 1]], { at: "2026-10-23T20:00:00Z" });
    const early = play([[ALEX, 2]], { at: "2026-10-21T20:00:00Z" });
    expect(groupStats([late, early], [ALEX], zone).plays).toEqual([early, late]);
  });

  const Plays = Schema.Array(
    Schema.Struct({
      trip: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
      game: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2 })),
      venue: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2 })),
      day: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 800 })),
      results: Schema.Array(
        Schema.Struct({
          player: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 })),
          net: Schema.Int.check(Schema.isBetween({ minimum: -1_000_000, maximum: 1_000_000 })),
        }),
      ),
    }),
  );

  const Filters = Schema.Struct({
    trip: Schema.Int.check(Schema.isBetween({ minimum: -1, maximum: 1 })),
    game: Schema.Int.check(Schema.isBetween({ minimum: -1, maximum: 2 })),
    venue: Schema.Int.check(Schema.isBetween({ minimum: -1, maximum: 2 })),
    year: Schema.Int.check(Schema.isBetween({ minimum: -1, maximum: 2 })),
  });

  it.prop(
    "standings match the group's finished results for every filter combination",
    [Plays, Filters],
    ([raw, f]) => {
      const people = [ALEX, BEA, CAL, DEE];
      const games = ["blackjack", "craps", null] as const;
      const venues = [wynn, bellagio, null] as const;
      const trips = [vegas, reno];

      const plays = raw.map((p, index) => {
        const startedAt = DateTime.makeUnsafe(Date.UTC(2025, 0, 1 + p.day, 20));

        return {
          id: `p${index}`,
          tripId: trips[p.trip]!,
          game: games[p.game]!,
          venueId: venues[p.venue]!,
          startedAt,
          endedAt: DateTime.makeUnsafe(DateTime.toEpochMillis(startedAt) + 45 * 60_000),
          results: [...new Map(p.results.map((r) => [r.player, r.net]))].map(([player, net]) => ({
            playerId: people[player]!,
            net,
            buyIn: 0,
            milliseconds: 45 * 60_000,
          })),
        };
      });

      const filters = Object.assign(
        {},
        f.trip === -1 ? {} : { tripId: trips[f.trip]! },
        f.game === -1 ? {} : { game: games[f.game]! },
        f.venue === -1 ? {} : { venueId: venues[f.venue]! },
        f.year === -1 ? {} : { year: 2025 + f.year },
      );

      const roster = [CAL, ALEX];
      const stats = groupStats(plays, roster, zone, filters);

      const inScope = plays.filter(
        (p) =>
          (filters.tripId === undefined
            ? filters.year === undefined ||
              p.endedAt.pipe(DateTime.getPart("year")) === filters.year
            : p.tripId === filters.tripId) &&
          (filters.game === undefined || p.game === filters.game) &&
          (filters.venueId === undefined || p.venueId === filters.venueId),
      );

      const expected = new Map<PlayerId, number>();

      for (const p of inScope)
        for (const r of p.results)
          expected.set(r.playerId, (expected.get(r.playerId) ?? 0) + r.net);

      const ranked = stats.standings.filter((s) => s.rank !== null);
      expect(new Map(ranked.map((s) => [s.playerId, s.result]))).toEqual(expected);
      expect(stats.result).toBe([...expected.values()].reduce((a, b) => a + b, 0));
      expect(stats.plays).toHaveLength(inScope.length);

      for (const id of roster)
        expect(stats.standings.filter((s) => s.playerId === id)).toHaveLength(1);
      const firstUnranked = stats.standings.findIndex((s) => s.rank === null);

      if (firstUnranked !== -1)
        for (const s of stats.standings.slice(firstUnranked)) {
          expect(s.rank).toBeNull();
          expect(s.result).toBe(0);
          expect(s.sessions).toBe(0);
        }

      for (const s of ranked)
        expect(s.rank).toBe(1 + ranked.filter((other) => other.result > s.result).length);
      expect(stats.byGame.reduce((sum, row) => sum + row.result, 0)).toBe(stats.result);
      expect(stats.byCasino.reduce((sum, row) => sum + row.sessions, 0)).toBe(inScope.length);
    },
  );
});

it.prop(
  "ranks a trip the way the trip's own standings do",
  [
    Schema.Array(
      Schema.Array(
        Schema.Struct({
          player: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 })),
          net: Schema.Int.check(Schema.isBetween({ minimum: -300, maximum: 300 })),
        }),
      ),
    ),
  ],
  ([tables]) => {
    const people = [ALEX, BEA, CAL, DEE];

    const plays = tables.map((rows, index) => {
      const startedAt = DateTime.makeUnsafe(Date.UTC(2026, 9, 21, 18 + (index % 6), index));

      return {
        id: TableId.make(
          `0192e7a0-0000-7000-8000-${(index + 1).toString(16).padStart(12, "0").slice(-12)}`,
        ),
        tripId: vegas,
        game: null,
        venueId: null,
        startedAt,
        endedAt: DateTime.makeUnsafe(DateTime.toEpochMillis(startedAt) + 30 * 60_000),
        results: [...new Map(rows.map((r) => [r.player, r.net]))].map(([player, net]) => ({
          playerId: people[player]!,
          net,
          buyIn: 0,
          milliseconds: 30 * 60_000,
        })),
      };
    });

    const ours = groupStats(plays, [], zone, { tripId: vegas }).standings;

    const trip = tripStandings(
      plays.map((play) => ({
        session: { id: play.id, startedAt: play.startedAt },
        venue: null,
        results: play.results.map((r) => ({ ...r, net: money(r.net), buyIn: money(r.buyIn) })),
      })),
      clock,
    );

    const byPlayer = (
      rows: ReadonlyArray<{
        playerId: PlayerId;
        rank: number | null;
        net?: number;
        result?: number;
      }>,
    ) => new Map(rows.map((row) => [row.playerId, [row.rank, row.net ?? row.result]]));

    expect(byPlayer(ours)).toEqual(byPlayer(trip));
  },
);

describe("groupAwards", () => {
  it("spreads the five awards so one hot player doesn't take them all", () => {
    const plays = [
      play(
        [
          [ALEX, 5000],
          [BEA, 100],
        ],
        { at: "2026-10-21T20:00:00Z", venueId: wynn },
      ),
      play(
        [
          [ALEX, 4000],
          [BEA, 200],
        ],
        { at: "2026-10-21T21:00:00Z", venueId: bellagio },
      ),
      play(
        [
          [ALEX, 3000],
          [BEA, -300],
        ],
        { at: "2026-10-21T22:00:00Z", venueId: null },
      ),
    ];

    expect(groupAwards(plays, clock).map((a) => [a.key, a.playerId, a.value])).toEqual([
      ["biggest_hit", ALEX, 5000],
      ["heater", BEA, 2],
      ["hopper", ALEX, 2],
    ]);
  });

  it("finds the comeback and the latest seat of the night", () => {
    const plays = [
      play(
        [
          [ALEX, -2000],
          [BEA, 100],
        ],
        { at: "2026-10-21T21:00:00Z" },
      ),
      play(
        [
          [BEA, -50],
          [CAL, 10],
        ],
        { at: "2026-10-22T03:00:00Z" },
      ),
      play([[ALEX, 3000]], { at: "2026-10-22T04:00:00Z" }),
    ];

    const awards = new Map(groupAwards(plays, clock).map((a) => [a.key, a]));
    expect(awards.get("comeback")).toMatchObject({ playerId: ALEX, value: 3000 });
    expect(awards.get("night_owl")).toMatchObject({ playerId: BEA, value: 3 });
    expect([...awards.keys()]).not.toContain("whale");
  });

  it("hands nothing out before anyone has played", () => {
    expect(groupAwards([], clock)).toEqual([]);
  });
});

describe("groupSeatBreakdown", () => {
  it("groups matched blackjack plays spatially with 1..7 then multiple", () => {
    const bj1 = play([
      [ALEX, 500],
      [BEA, -200],
    ]);

    const bj2 = play([
      [ALEX, 300],
      [CAL, -100],
    ]);

    const craps = play([[ALEX, 900]], { game: "craps" });

    const rows = groupSeatBreakdown(
      [bj1, bj2, craps],
      [
        { playId: bj1.id, playerId: ALEX, seat: "multiple", net: 500, milliseconds: 3_600_000 },
        { playId: bj1.id, playerId: BEA, seat: 5, net: -200, milliseconds: 1_800_000 },
        { playId: bj2.id, playerId: ALEX, seat: 1, net: 300, milliseconds: 3_600_000 },
        { playId: bj2.id, playerId: CAL, seat: 5, net: -100, milliseconds: 1_800_000 },
        { playId: craps.id, playerId: ALEX, seat: 1, net: 900, milliseconds: 3_600_000 },
      ],
    );

    expect(rows).toEqual([
      { seat: 1, sessions: 1, hours: 1, result: 300 },
      { seat: 5, sessions: 2, hours: 1, result: -300 },
      { seat: "multiple", sessions: 1, hours: 1, result: 500 },
    ]);
  });

  it("hides below the breakdown minimum plays or matched seat visits", () => {
    const only = play([[ALEX, 500]]);
    const second = play([[BEA, -100]]);

    expect(
      groupSeatBreakdown(
        [only],
        [{ playId: only.id, playerId: ALEX, seat: 1, net: 500, milliseconds: 3_600_000 }],
      ),
    ).toEqual([]);
    expect(
      groupSeatBreakdown(
        [only, second],
        [{ playId: only.id, playerId: ALEX, seat: 1, net: 500, milliseconds: 3_600_000 }],
      ),
    ).toEqual([]);
  });
});
