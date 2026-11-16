import { describe, expect, it } from "@effect/vitest";
import { TripId, VenueId, type Game, type PlayerId } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";

import { ALEX, BEA, CAL, DEE, money } from "./testing/ledgerArbitrary.ts";
import { groupAwards, groupStats, type GroupPlay } from "./stats.ts";
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
    tripId?: TripId;
    game?: Game | null;
    venueId?: VenueId | null;
  } = {},
): GroupPlay => ({
  id: `play-${++count}`,
  tripId: fields.tripId ?? vegas,
  game: fields.game === undefined ? "blackjack" : fields.game,
  venueId: fields.venueId === undefined ? wynn : fields.venueId,
  startedAt: DateTime.makeUnsafe(fields.at ?? "2026-10-21T20:00:00Z"),
  results: results.map(([playerId, net, minutes]) => ({
    playerId,
    net,
    buyIn: Math.max(0, -net),
    minutes: minutes ?? 60,
  })),
});

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
      // Nothing breaks a tie: the roster's order keeps them in place.
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
      minutes: 180,
      hourlyResult: 200,
      wins: 1,
    });
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
      { game: "blackjack", sessions: 1, result: 300 },
      { game: "craps", sessions: 1, result: 50 },
      { game: null, sessions: 1, result: -20 },
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
      const plays = raw.map((p, index) => ({
        id: `p${index}`,
        tripId: trips[p.trip]!,
        game: games[p.game]!,
        venueId: venues[p.venue]!,
        startedAt: DateTime.makeUnsafe(Date.UTC(2025, 0, 1 + p.day, 20)),
        // One result per player at a table.
        results: [...new Map(p.results.map((r) => [r.player, r.net]))].map(([player, net]) => ({
          playerId: people[player]!,
          net,
          buyIn: 0,
          minutes: 45,
        })),
      }));
      const filters = {
        ...(f.trip === -1 ? {} : { tripId: trips[f.trip]! }),
        ...(f.game === -1 ? {} : { game: games[f.game]! }),
        ...(f.venue === -1 ? {} : { venueId: venues[f.venue]! }),
        ...(f.year === -1 ? {} : { year: 2025 + f.year }),
      };
      const roster = [CAL, ALEX];
      const stats = groupStats(plays, roster, zone, filters);

      const inScope = plays.filter(
        (p) =>
          (filters.tripId === undefined
            ? filters.year === undefined ||
              p.startedAt.pipe(DateTime.getPart("year")) === filters.year
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
      // Everyone on the roster appears once; the unranked sit last at zero.
      for (const id of roster)
        expect(stats.standings.filter((s) => s.playerId === id)).toHaveLength(1);
      const firstUnranked = stats.standings.findIndex((s) => s.rank === null);
      if (firstUnranked !== -1)
        for (const s of stats.standings.slice(firstUnranked)) {
          expect(s.rank).toBeNull();
          expect(s.result).toBe(0);
          expect(s.sessions).toBe(0);
        }
      // Each rank is one more than the number of members strictly ahead.
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
    const plays = tables.map((rows, index) => ({
      id: `t${index}`,
      tripId: vegas,
      game: null,
      venueId: null,
      startedAt: DateTime.makeUnsafe(Date.UTC(2026, 9, 21, 18 + (index % 6), index)),
      results: [...new Map(rows.map((r) => [r.player, r.net]))].map(([player, net]) => ({
        playerId: people[player]!,
        net,
        buyIn: 0,
        minutes: 30,
      })),
    }));
    const ours = groupStats(plays, [], zone, { tripId: vegas }).standings;
    const trip = tripStandings(
      plays.map((play) => ({
        session: { id: play.id as never, startedAt: play.startedAt },
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
    // Alex sat down latest, at 4am, but already holds awards, so the next owl gets it.
    expect(awards.get("night_owl")).toMatchObject({ playerId: BEA, value: 3 });
    expect([...awards.keys()]).not.toContain("whale");
  });

  it("hands nothing out before anyone has played", () => {
    expect(groupAwards([], clock)).toEqual([]);
  });
});
