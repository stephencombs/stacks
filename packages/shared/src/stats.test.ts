import { describe, expect, it } from "@effect/vitest";
import { Game, MinorUnits, TripId, VenueId, VisitId, type PlayerId } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";

import { ALEX, BEA, CAL, RandomLedger, toEntries } from "./testing/ledgerArbitrary.ts";
import { visit } from "./testing/recording.ts";
import { playerResults } from "./results.ts";
import {
  leadingBucket,
  personalStats,
  raceLines,
  runningReturns,
  runningTotals,
  type StatsSession,
} from "./stats.ts";

const palazzo = { id: "palazzo", name: "The Palazzo" };
const wynn = { id: "wynn", name: "Wynn" };

const session = (
  venue: StatsSession["venue"],
  results: ReadonlyArray<[PlayerId, number, number?]>,
) => ({
  venue,
  results: results.map(([playerId, net, buyIn]) => ({ playerId, net, buyIn: buyIn ?? 0 })),
});

describe("runningTotals", () => {
  it("carries a total through sessions the player sat out", () => {
    const sessions = [
      session(palazzo, [[ALEX, 100]]),
      session(wynn, [[BEA, 50]]),
      session(wynn, [[ALEX, -40]]),
    ];

    expect(runningTotals(sessions, ALEX)).toEqual([100, 100, 60]);
  });
});

describe("runningReturns", () => {
  it("divides the running result by everything bought in so far", () => {
    const sessions = [
      session(palazzo, [[ALEX, 27500, 50000]]),
      session(wynn, [[BEA, -600000, 2000000]]),
      session(wynn, [[ALEX, -2500, 50000]]),
    ];

    expect(runningReturns(sessions, ALEX)).toEqual([0.55, 0.55, 0.25]);
    expect(runningReturns(sessions, BEA)).toEqual([null, -0.3, -0.3]);
  });

  it("stays empty for a player who never put money in", () => {
    expect(runningReturns([session(palazzo, [[CAL, 4000, 0]])], CAL)).toEqual([null]);
  });

  it.prop(
    "never loses more than everything bought in",
    [
      Schema.Array(
        Schema.Struct({
          buyIn: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1e9 })),
          cashOut: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1e9 })),
        }),
      ),
    ],
    ([plays]) => {
      const sessions = plays.map(({ buyIn, cashOut }) =>
        session(palazzo, [[ALEX, cashOut - buyIn, buyIn]]),
      );

      for (const value of runningReturns(sessions, ALEX))
        if (value !== null) expect(value).toBeGreaterThanOrEqual(-1);
    },
  );
});

describe("raceLines", () => {
  it("starts every line at break-even and reads money or return", () => {
    const sessions = [
      session(palazzo, [[ALEX, 27500, 50000]]),
      session(wynn, [[BEA, -6000, 20000]]),
    ];

    expect(raceLines(sessions, [ALEX, BEA], "money").map((l) => l.line)).toEqual([
      [0, 27500, 27500],
      [0, 0, -6000],
    ]);
    expect(raceLines(sessions, [BEA], "return")[0]).toEqual({
      playerId: BEA,
      values: [null, -0.3],
      line: [0, 0, -0.3],
    });
  });
});

const zone = DateTime.zoneMakeNamedUnsafe("America/Los_Angeles");
const casino = VenueId.make("0192e7a0-0000-7000-8000-0000000000c1");
const otherCasino = VenueId.make("0192e7a0-0000-7000-8000-0000000000c2");
const missingCasino = VenueId.make("0192e7a0-0000-7000-8000-0000000000c3");
const vegasTrip = TripId.make("0192e7a0-0000-7000-8000-0000000000d1");
const renoTrip = TripId.make("0192e7a0-0000-7000-8000-0000000000d2");

const zeroTotals = (adjustment: number) => ({
  buyIn: MinorUnits.make(0),
  cashOut: MinorUnits.make(0),
  adjustment: MinorUnits.make(adjustment),
});

const personalSession = (
  id: number,
  result: number,
  fields: {
    startedAt?: string;
    finishedAt?: string | null;
    game?: typeof Game.Type | null;
    venueId?: VenueId | null;
    tripId?: TripId | null;
    totals?: { buyIn: MinorUnits; cashOut: MinorUnits; adjustment: MinorUnits };
  } = {},
) => ({
  visit: {
    ...visit,
    id: VisitId.make(`0192e7a0-0000-7000-8000-${id.toString(16).padStart(12, "0")}`),
    startedAt: DateTime.makeUnsafe(fields.startedAt ?? "2026-11-06T20:00:00Z"),
    finishedAt:
      fields.finishedAt === null
        ? null
        : DateTime.makeUnsafe(fields.finishedAt ?? "2026-11-06T21:00:00Z"),
  },
  totals: fields.totals ?? zeroTotals(result),
  finalResult: fields.finishedAt === null ? null : MinorUnits.make(result),
  table: {
    game: fields.game === undefined ? ("blackjack" as const) : fields.game,
    venueId: fields.venueId === undefined ? casino : fields.venueId,
    tripId: fields.tripId ?? null,
  },
});

describe("personalStats", () => {
  it("counts ahead, behind and break-even sessions, excluding live play everywhere", () => {
    const stats = personalStats(
      [
        personalSession(1, 100),
        personalSession(2, -40),
        personalSession(3, 0),
        personalSession(4, 900, { finishedAt: null, game: "slots", venueId: otherCasino }),
      ],
      zone,
    );

    expect(stats.summary).toEqual({
      result: 60,
      sessions: 3,
      hours: 3,
      hourlyResult: 20,
      winRate: { wins: 1, sessions: 3 },
    });
    expect(stats.runningResult.map((point) => point.sessionId)).toHaveLength(3);
    expect(stats.byGame).toEqual([{ game: "blackjack", sessions: 3, hours: 3, result: 60 }]);
    expect(stats.byCasino).toEqual([{ venueId: casino, sessions: 3, hours: 3, result: 60 }]);
    expect(stats.options).toEqual({
      years: [2026],
      games: ["blackjack"],
      venueIds: [casino],
      tripIds: [],
    });
  });

  it("shows a whole trip, whatever the period, and offers each trip played", () => {
    const sessions = [
      personalSession(1, 100, { tripId: vegasTrip, finishedAt: "2025-12-31T23:00:00Z" }),
      personalSession(2, 50, { tripId: vegasTrip, finishedAt: "2026-01-01T03:00:00Z" }),
      personalSession(3, -70, { tripId: renoTrip }),
      personalSession(4, 900),
      personalSession(5, 400, { tripId: renoTrip, finishedAt: null }),
    ];

    const stats = personalStats(sessions, zone, { tripId: vegasTrip, year: 2026 });
    expect(stats.summary).toMatchObject({ result: 150, sessions: 2 });
    expect(personalStats(sessions, zone).options.tripIds).toEqual([renoTrip, vegasTrip]);
  });

  it("returns zero summaries and empty rows for no history, live-only history and no matches", () => {
    for (const sessions of [
      [],
      [personalSession(1, 100, { finishedAt: null })],
      [personalSession(2, 100)],
    ]) {
      const stats = personalStats(sessions, zone, { year: 2024 });
      expect(stats.summary).toEqual({
        result: 0,
        sessions: 0,
        hours: 0,
        hourlyResult: null,
        winRate: { wins: 0, sessions: 0 },
      });
      expect(stats.runningResult).toEqual([]);
      expect(stats.byGame).toEqual([]);
      expect(stats.byCasino).toEqual([]);
      expect(stats.options.years).toEqual(
        sessions[0]?.finalResult !== null && sessions.length > 0 ? [2026] : [],
      );
    }
  });

  it("uses the finish's calendar year in the caller's zone at both year boundaries", () => {
    const sessions = [
      personalSession(1, 10, {
        startedAt: "2025-12-31T23:00:00Z",
        finishedAt: "2026-01-01T07:59:59.999Z",
      }),
      personalSession(2, 20, {
        startedAt: "2025-12-31T23:00:00Z",
        finishedAt: "2026-01-01T08:00:00Z",
      }),
      personalSession(3, 30, {
        startedAt: "2026-12-31T23:00:00Z",
        finishedAt: "2027-01-01T07:59:59.999Z",
      }),
      personalSession(4, 40, {
        startedAt: "2026-12-31T23:00:00Z",
        finishedAt: "2027-01-01T08:00:00Z",
      }),
    ];

    expect(personalStats(sessions, zone, { year: 2026 }).summary.result).toBe(50);
    expect(personalStats(sessions, zone, { year: 2025 }).summary.result).toBe(10);
    expect(personalStats(sessions, zone).options.years).toEqual([2027, 2026, 2025]);
    expect(
      personalStats(sessions, DateTime.zoneMakeNamedUnsafe("UTC"), { year: 2026 }).summary.result,
    ).toBe(30);
  });

  it("composes year, game and casino filters, including unset values", () => {
    const sessions = [
      personalSession(1, 100),
      personalSession(2, 200, { game: "slots" }),
      personalSession(3, 300, { venueId: otherCasino }),
      personalSession(4, 400, {
        startedAt: "2025-01-01T20:00:00Z",
        finishedAt: "2025-01-01T21:00:00Z",
      }),
      personalSession(5, 500, { game: null, venueId: null }),
    ];

    const filtered = personalStats(sessions, zone, {
      year: 2026,
      game: "blackjack",
      venueId: casino,
    });

    expect(filtered.summary.result).toBe(100);
    expect(personalStats(sessions, zone, { game: null, venueId: null }).summary.result).toBe(500);
    expect(
      personalStats(sessions, zone, { game: "slots", venueId: otherCasino }).summary.sessions,
    ).toBe(0);
    expect(filtered.options).toEqual({
      years: [2026, 2025],
      games: ["blackjack", "slots", null],
      venueIds: [casino, otherCasino, null],
      tripIds: [],
    });
    expect(personalStats(sessions, zone, { year: 2024 }).options).toEqual(filtered.options);
  });

  it("sorts chart points by finish, then session ID, without changing the input", () => {
    const sessions = Object.freeze([
      personalSession(3, -40, { finishedAt: "2026-11-06T23:00:00Z" }),
      personalSession(2, 0),
      personalSession(1, 100),
    ]);

    const stats = personalStats(sessions, zone);
    expect(stats.runningResult).toEqual([
      {
        sessionId: sessions[2]!.visit.id,
        finishedAt: sessions[2]!.visit.finishedAt,
        result: 100,
        total: 100,
      },
      {
        sessionId: sessions[1]!.visit.id,
        finishedAt: sessions[1]!.visit.finishedAt,
        result: 0,
        total: 100,
      },
      {
        sessionId: sessions[0]!.visit.id,
        finishedAt: sessions[0]!.visit.finishedAt,
        result: -40,
        total: 60,
      },
    ]);
    expect(personalStats(sessions.toReversed(), zone)).toEqual(stats);
  });

  it("keeps no-casino and unset-game rows and orders ties by game or venue ID", () => {
    const stats = personalStats(
      [
        personalSession(1, -50, { game: "slots", venueId: null }),
        personalSession(2, 100, { game: "roulette", venueId: otherCasino }),
        personalSession(3, 60),
        personalSession(4, 40),
        personalSession(5, -100, { game: null, venueId: null }),
      ],
      zone,
    );

    expect(stats.byGame).toEqual([
      { game: "blackjack", result: 100, sessions: 2, hours: 2 },
      { game: "roulette", result: 100, sessions: 1, hours: 1 },
      { game: "slots", result: -50, sessions: 1, hours: 1 },
      { game: null, result: -100, sessions: 1, hours: 1 },
    ]);
    expect(stats.byCasino).toEqual([
      { venueId: casino, result: 100, sessions: 2, hours: 2 },
      { venueId: otherCasino, result: 100, sessions: 1, hours: 1 },
      { venueId: null, result: -150, sessions: 2, hours: 2 },
    ]);
  });

  it("rounds summed hours once and computes hourly result from the full elapsed time", () => {
    const short = (id: number, result: number) =>
      personalSession(id, result, {
        startedAt: "2026-11-06T20:00:00Z",
        finishedAt: "2026-11-06T20:00:18Z",
      });

    const single = personalStats([short(1, 1)], zone);
    expect(single.summary.hours).toBe(0.01);
    expect(single.summary.hourlyResult).toBe(200);
    const summed = personalStats([short(1, 1), short(2, 1)], zone);
    expect(summed.summary.hours).toBe(0.01);
    expect(summed.byGame[0]!.hours).toBe(0.01);
    expect(summed.byCasino[0]!.hours).toBe(0.01);
    expect(summed.summary.hourlyResult).toBe(200);

    const tiny = personalStats(
      [personalSession(1, 1, { finishedAt: "2026-11-06T20:00:00.001Z" })],
      zone,
    );

    expect(tiny.summary.hours).toBe(0);
    expect(tiny.summary.hourlyResult).toBe(3_600_000);
  });

  it("rounds hourly halves away from zero and has no hourly result without elapsed time", () => {
    for (const [result, expected] of [
      [1, 1],
      [-1, -1],
      [3, 2],
      [-3, -2],
    ] as const) {
      expect(
        personalStats([personalSession(1, result, { finishedAt: "2026-11-06T22:00:00Z" })], zone)
          .summary.hourlyResult,
      ).toBe(expected);
    }

    const instant = personalSession(1, 10, { finishedAt: "2026-11-06T20:00:00Z" });
    expect(personalStats([instant], zone).summary).toEqual({
      result: 10,
      sessions: 1,
      hours: 0,
      hourlyResult: null,
      winRate: { wins: 1, sessions: 1 },
    });
  });

  it("measures elapsed time across a daylight-saving change", () => {
    const stats = personalStats(
      [
        personalSession(1, 200, {
          startedAt: "2026-11-01T08:30:00Z",
          finishedAt: "2026-11-01T10:30:00Z",
        }),
      ],
      zone,
    );

    expect(stats.summary.hours).toBe(2);
    expect(stats.summary.hourlyResult).toBe(100);
  });

  it("preserves safe-integer money and rejects overflowing totals, chart points and rates", () => {
    const max = Number.MAX_SAFE_INTEGER;
    const sessions = [personalSession(1, max), personalSession(2, -max)];
    expect(personalStats(sessions, zone).summary.result).toBe(0);
    expect(personalStats([sessions[0]!], zone).summary.hourlyResult).toBe(max);
    expect(() => personalStats([personalSession(1, max), personalSession(2, 1)], zone)).toThrow(
      RangeError,
    );
    expect(() =>
      personalStats(
        [personalSession(1, max), personalSession(2, 1), personalSession(3, -max)],
        zone,
      ),
    ).toThrow(RangeError);
    expect(() =>
      personalStats([personalSession(1, max, { finishedAt: "2026-11-06T20:30:00Z" })], zone),
    ).toThrow(RangeError);

    for (const fields of [{ game: "slots" as const }, { venueId: otherCasino }]) {
      expect(() =>
        personalStats(
          [personalSession(1, max), personalSession(2, -max, fields), personalSession(3, 1)],
          zone,
        ),
      ).toThrow(RangeError);
    }
  });

  it.prop(
    "conserves results across every combination of filters and breakdowns",
    [
      Schema.Array(
        Schema.Struct({
          ledger: RandomLedger,
          year: Schema.Literals([2024, 2025, 2026]),
          game: Schema.NullOr(Game),
          venueId: Schema.NullOr(Schema.Literals([casino, otherCasino])),
          tripId: Schema.NullOr(Schema.Literals([vegasTrip, renoTrip])),
          minutes: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 480 })),
          live: Schema.Boolean,
        }),
      ),
    ],
    ([records]) => {
      const sessions = records.map((record, index) => {
        const finish = DateTime.makeUnsafe(`${record.year}-06-01T12:00:00Z`);

        return personalSession(
          index + 1,
          playerResults(toEntries(record.ledger)).get(ALEX)?.net ?? 0,
          {
            startedAt: DateTime.formatIso(
              DateTime.makeUnsafe(DateTime.toEpochMillis(finish) - record.minutes * 60_000),
            ),
            finishedAt: record.live ? null : DateTime.formatIso(finish),
            game: record.game,
            venueId: record.venueId,
            tripId: record.tripId,
          },
        );
      });

      for (const [year, tripId] of [
        ...[undefined, 2024, 2025, 2026, 2030].map((year) => [year, undefined] as const),
        [2025, vegasTrip] as const,
        [undefined, renoTrip] as const,
      ]) {
        for (const game of [undefined, ...Game.literals, null]) {
          for (const venueId of [undefined, casino, otherCasino, missingCasino, null]) {
            const expected = sessions.filter(
              (session, index) =>
                !records[index]!.live &&
                (tripId === undefined
                  ? year === undefined || records[index]!.year === year
                  : session.table.tripId === tripId) &&
                (game === undefined || session.table.game === game) &&
                (venueId === undefined || session.table.venueId === venueId),
            );

            const sum = expected.reduce(
              (total, session) => total + BigInt(session.finalResult!),
              0n,
            );

            const stats = personalStats(sessions, zone, { year, game, venueId, tripId });
            expect(stats.summary.result).toBe(Number(sum));
            expect(stats.summary.sessions).toBe(expected.length);
            expect(stats.summary.winRate).toEqual({
              wins: expected.filter((session) => session.finalResult! > 0).length,
              sessions: expected.length,
            });

            for (const rows of [stats.byGame, stats.byCasino]) {
              expect(rows.reduce((total, row) => total + BigInt(row.result), 0n)).toBe(sum);
              expect(rows.reduce((total, row) => total + row.sessions, 0)).toBe(expected.length);
            }

            expect(stats.runningResult.at(-1)?.total ?? 0).toBe(Number(sum));
          }
        }
      }
    },
  );
});

it("excludes deleted visits even when passed unfiltered results", () => {
  const deleted = personalSession(1, 10000);
  const kept = personalSession(2, -5000);
  expect(
    personalStats(
      [
        {
          ...deleted,
          visit: { ...deleted.visit, deletedAt: DateTime.makeUnsafe("2026-11-07T20:00:00Z") },
        },
        kept,
      ],
      DateTime.zoneMakeNamedUnsafe("UTC"),
    ),
  ).toEqual(personalStats([kept], DateTime.zoneMakeNamedUnsafe("UTC")));
});

describe("personalStats for Just me", () => {
  const utc = DateTime.zoneMakeNamedUnsafe("UTC");
  const NOW = DateTime.makeUnsafe("2026-11-23T12:00:00Z");

  const played = (
    id: number,
    result: number,
    start: string,
    fields: Parameters<typeof personalSession>[2] = {},
    minutes = 60,
  ) =>
    personalSession(id, result, {
      ...fields,
      startedAt: start,
      finishedAt: DateTime.formatIso(DateTime.add(DateTime.makeUnsafe(start), { minutes })),
    });

  const stats = (
    sessions: ReadonlyArray<ReturnType<typeof personalSession>>,
    filters: Parameters<typeof personalStats>[2] = {},
  ) => personalStats(sessions, utc, filters, NOW);

  const totals = (buyIn: number, cashOut: number, adjustment = 0) => ({
    buyIn: MinorUnits.make(buyIn),
    cashOut: MinorUnits.make(cashOut),
    adjustment: MinorUnits.make(adjustment),
  });

  const months = (result: ReturnType<typeof stats>) =>
    result.periods?.rows.map((row) => [row.key, row.played ? row.result : null]);

  describe("one session", () => {
    const one = stats([played(1, 4500, "2026-11-06T20:00:00Z")]);

    it("has no charts, no patterns and no climb", () => {
      expect(one.periods).toBeNull();
      expect(one.climb).toBeNull();
      expect(leadingBucket(one.weekdays)).toBeNull();
      expect(leadingBucket(one.lengths)).toBeNull();
    });

    it("has only the record that matches its sign", () => {
      expect(one.records.win).toMatchObject({ result: 4500 });
      expect(one.records.loss).toBeNull();
      const lost = stats([played(1, -4500, "2026-11-06T20:00:00Z")]);
      expect(lost.records.win).toBeNull();
      expect(lost.records.loss).toMatchObject({ result: -4500 });
    });

    it("has neither record when it broke even", () => {
      const even = stats([played(1, 0, "2026-11-06T20:00:00Z")]);
      expect(even.records).toEqual({ win: null, loss: null });
      expect(even.money.even).toBe(1);
    });
  });

  describe("climb", () => {
    it("measures from the lowest point below zero to where the result stands", () => {
      const result = stats([
        played(1, -300, "2026-11-01T20:00:00Z"),
        played(2, -200, "2026-11-02T20:00:00Z"),
        played(3, 400, "2026-11-03T20:00:00Z"),
      ]);

      expect(result.summary.result).toBe(-100);
      expect(result.climb).toBe(400);
    });

    it("counts a climb that finished below zero, and one that finished above it", () => {
      expect(
        stats([played(1, -500, "2026-11-01T20:00:00Z"), played(2, 100, "2026-11-02T20:00:00Z")])
          .climb,
      ).toBe(100);
      expect(
        stats([played(1, -100, "2026-11-01T20:00:00Z"), played(2, 900, "2026-11-02T20:00:00Z")])
          .climb,
      ).toBe(900);
    });

    it("is null when every session won", () => {
      const wins = stats([
        played(1, 100, "2026-11-01T20:00:00Z"),
        played(2, 50, "2026-11-02T20:00:00Z"),
        played(3, 300, "2026-11-03T20:00:00Z"),
      ]);

      expect(wins.climb).toBeNull();
      expect(wins.records.loss).toBeNull();
      expect(wins.money.lost).toEqual({ sessions: 0, result: 0 });
      expect(wins.money.won).toEqual({ sessions: 3, result: 450 });
    });

    it("is null when every session lost, since the result ends at its low", () => {
      const losses = stats([
        played(1, -100, "2026-11-01T20:00:00Z"),
        played(2, -50, "2026-11-02T20:00:00Z"),
      ]);

      expect(losses.climb).toBeNull();
      expect(losses.records.win).toBeNull();
      expect(losses.records.loss).toMatchObject({ result: -100 });
      expect(losses.money.won).toEqual({ sessions: 0, result: 0 });
    });

    it("is null when the latest session set a new low", () => {
      expect(
        stats([
          played(1, -100, "2026-11-01T20:00:00Z"),
          played(2, 80, "2026-11-02T20:00:00Z"),
          played(3, -200, "2026-11-03T20:00:00Z"),
        ]).climb,
      ).toBeNull();
    });
  });

  describe("money", () => {
    it("splits won, lost and even, and sums buy-ins, cash-outs and adjustments", () => {
      const result = stats([
        played(1, 300, "2026-11-01T20:00:00Z", { totals: totals(1000, 1300) }),
        played(2, -400, "2026-11-02T20:00:00Z", { totals: totals(1000, 600) }),
        played(3, 0, "2026-11-03T20:00:00Z", { totals: totals(500, 500) }),
        played(4, 150, "2026-11-04T20:00:00Z", { totals: totals(1000, 1100, 50) }),
      ]);

      expect(result.money).toEqual({
        won: { sessions: 2, result: 450 },
        lost: { sessions: 1, result: -400 },
        even: 1,
        buyIn: 3500,
        cashOut: 3500,
        adjustment: 50,
      });
      expect(result.summary.result).toBe(50);
      expect(result.money.cashOut + result.money.adjustment - result.money.buyIn).toBe(
        result.summary.result,
      );
    });

    it("keeps a non-zero adjustment apart from buy-ins and cash-outs", () => {
      const result = stats([
        played(1, -250, "2026-11-01T20:00:00Z", { totals: totals(1000, 750) }),
        played(2, 75, "2026-11-02T20:00:00Z", { totals: totals(500, 500, 75) }),
      ]);

      expect(result.money.adjustment).toBe(75);
      expect(result.money.buyIn).toBe(1500);
      expect(result.money.cashOut).toBe(1250);
      expect(result.summary.result).toBe(-175);
    });

    it("sums to zero buy-ins when nothing was bought in", () => {
      const result = stats([played(1, 600, "2026-11-01T20:00:00Z", { totals: totals(0, 600) })]);

      expect(result.money.buyIn).toBe(0);
      expect(result.summary.result).toBe(600);
    });

    it("leaves live and deleted visits out of every sum", () => {
      const live = personalSession(2, 0, {
        startedAt: "2026-11-02T20:00:00Z",
        finishedAt: null,
      });

      const dead = played(3, 900, "2026-11-03T20:00:00Z");

      const result = stats([
        played(1, 100, "2026-11-01T20:00:00Z"),
        live,
        { ...dead, visit: { ...dead.visit, deletedAt: NOW } },
      ]);

      expect(result.summary.sessions).toBe(1);
      expect(result.money.won).toEqual({ sessions: 1, result: 100 });
    });
  });

  describe("time", () => {
    it("has no hourly result for zero elapsed time, but keeps the result", () => {
      const instant = personalSession(1, 700, {
        startedAt: "2026-11-06T20:00:00Z",
        finishedAt: "2026-11-06T20:00:00Z",
      });

      const result = stats([instant]);
      expect(result.summary).toMatchObject({ result: 700, hours: 0, hourlyResult: null });
      expect(result.money.won).toEqual({ sessions: 1, result: 700 });
    });

    it("has an hourly result once any time has elapsed", () => {
      expect(stats([played(1, 700, "2026-11-06T20:00:00Z", {}, 30)]).summary.hourlyResult).toBe(
        1400,
      );
    });
  });

  describe("by month", () => {
    const two = [
      played(1, 100, "2026-09-05T20:00:00Z"),
      played(2, -50, "2026-10-05T20:00:00Z"),
      played(3, 70, "2026-10-09T20:00:00Z"),
    ];

    it("is hidden at 2 played months and shown at exactly 3", () => {
      expect(stats(two).periods).toBeNull();
      const three = stats([...two, played(4, 25, "2026-11-05T20:00:00Z")]);
      expect(three.periods?.by).toBe("month");
      expect(three.periods?.rows.filter((row) => row.played)).toHaveLength(3);
    });

    it("shows all time as the trailing 12 months ending at the latest one played", () => {
      const result = stats([
        played(1, 100, "2025-02-05T20:00:00Z"),
        played(2, 200, "2025-04-05T20:00:00Z"),
        played(3, -300, "2025-12-05T20:00:00Z"),
        played(4, 40, "2026-03-05T20:00:00Z"),
        played(5, -60, "2026-06-05T20:00:00Z"),
      ]);

      expect(months(result)).toEqual([
        ["2025-07", null],
        ["2025-08", null],
        ["2025-09", null],
        ["2025-10", null],
        ["2025-11", null],
        ["2025-12", -300],
        ["2026-01", null],
        ["2026-02", null],
        ["2026-03", 40],
        ["2026-04", null],
        ["2026-05", null],
        ["2026-06", -60],
      ]);
    });

    it("counts only the played months inside the trailing window toward the floor", () => {
      expect(
        stats([
          played(1, 100, "2024-01-05T20:00:00Z"),
          played(2, 100, "2024-02-05T20:00:00Z"),
          played(3, 100, "2024-03-05T20:00:00Z"),
          played(4, 100, "2026-06-05T20:00:00Z"),
        ]).periods,
      ).toBeNull();
    });

    it("runs a past year from January to December", () => {
      const result = stats(
        [
          played(1, 100, "2025-03-05T20:00:00Z"),
          played(2, 100, "2025-05-05T20:00:00Z"),
          played(3, 100, "2025-06-05T20:00:00Z"),
        ],
        { year: 2025 },
      );

      expect(result.periods?.rows.map((row) => row.key)).toEqual(
        Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, "0")}`),
      );
    });

    it("runs the current year from January to the current month", () => {
      const result = stats(
        [
          played(1, 100, "2026-03-05T20:00:00Z"),
          played(2, 100, "2026-05-05T20:00:00Z"),
          played(3, 100, "2026-06-05T20:00:00Z"),
        ],
        { year: 2026 },
      );

      expect(result.periods?.rows.map((row) => row.key)).toEqual(
        Array.from({ length: 11 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`),
      );
    });

    it("tells a played month that broke even from one that wasn't played", () => {
      const result = stats(
        [
          played(1, 100, "2026-01-05T20:00:00Z"),
          played(2, 100, "2026-02-05T20:00:00Z"),
          played(3, -100, "2026-02-09T20:00:00Z"),
          played(4, 20, "2026-04-05T20:00:00Z"),
        ],
        { year: 2026 },
      );

      const [, feb, mar] = result.periods!.rows;
      expect(feb).toEqual({ key: "2026-02", sessions: 2, result: 0, played: true });
      expect(mar).toEqual({ key: "2026-03", sessions: 0, result: 0, played: false });
    });

    it("puts a session in the month it finished, as the year filter does", () => {
      const result = stats(
        [
          played(1, 100, "2026-01-31T23:30:00Z"),
          played(2, 100, "2026-02-14T20:00:00Z"),
          played(3, 100, "2026-03-14T20:00:00Z"),
          played(4, 100, "2026-04-14T20:00:00Z"),
        ],
        { year: 2026 },
      );

      expect(result.periods?.rows.slice(0, 3).map((row) => [row.key, row.sessions])).toEqual([
        ["2026-01", 0],
        ["2026-02", 2],
        ["2026-03", 1],
      ]);
    });
  });

  describe("by night", () => {
    const trip = { tripId: vegasTrip };

    const nights = (sessions: ReadonlyArray<ReturnType<typeof personalSession>>) =>
      stats(sessions, { tripId: vegasTrip }).periods;

    it("replaces months with a trip's nights, split at 06:00", () => {
      const result = nights([
        played(1, 100, "2026-11-06T20:00:00Z", trip),
        played(2, -40, "2026-11-07T01:00:00Z", trip),
        played(3, 70, "2026-11-07T05:59:00Z", trip),
        played(4, 10, "2026-11-07T06:00:00Z", trip),
      ]);

      expect(result?.by).toBe("night");
      expect(result?.rows).toEqual([
        { key: "2026-11-06", sessions: 3, result: 130, played: true },
        { key: "2026-11-07", sessions: 1, result: 10, played: true },
      ]);
    });

    it("is shown at exactly 2 nights and hidden at 1", () => {
      expect(
        nights([
          played(1, 100, "2026-11-06T20:00:00Z", trip),
          played(2, 100, "2026-11-06T22:00:00Z", trip),
        ]),
      ).toBeNull();
      expect(
        nights([
          played(1, 100, "2026-11-06T20:00:00Z", trip),
          played(2, 100, "2026-11-07T20:00:00Z", trip),
        ])?.rows,
      ).toHaveLength(2);
    });

    it("keeps a night nobody played as a gap, across a month end", () => {
      const result = nights([
        played(1, 100, "2026-10-30T20:00:00Z", trip),
        played(2, -100, "2026-11-02T20:00:00Z", trip),
      ]);

      expect(result?.rows.map((row) => [row.key, row.played])).toEqual([
        ["2026-10-30", true],
        ["2026-10-31", false],
        ["2026-11-01", false],
        ["2026-11-02", true],
      ]);
      expect(result?.rows[1]).toMatchObject({ result: 0, sessions: 0 });
    });

    it("breaks the night in the viewer's zone", () => {
      const la = personalStats(
        [
          played(1, 100, "2026-11-07T03:00:00Z", trip),
          played(2, 100, "2026-11-08T03:00:00Z", trip),
        ],
        zone,
        { tripId: vegasTrip },
        NOW,
      );

      expect(la.periods?.rows.map((row) => row.key)).toEqual(["2026-11-06", "2026-11-07"]);
    });
  });

  describe("patterns", () => {
    const weekly = (count: number, result: number, start: string, id: number, minutes = 60) =>
      Array.from({ length: count }, (_, i) =>
        played(
          id + i,
          result,
          DateTime.formatIso(DateTime.add(DateTime.makeUnsafe(start), { days: 7 * i })),
          {},
          minutes,
        ),
      );

    it("buckets by the weekday a session started, in the viewer's zone", () => {
      const sessions = [
        played(1, 100, "2026-11-06T02:00:00Z"),
        played(2, 300, "2026-11-06T20:00:00Z"),
      ];

      expect(stats(sessions).weekdays[5]).toMatchObject({ sessions: 2, result: 400, average: 200 });
      expect(personalStats(sessions, zone, {}, NOW).weekdays[4]).toMatchObject({
        sessions: 1,
        result: 100,
      });
    });

    it("splits lengths at 1, 2 and 3 hours, a session on an edge falling in the longer one", () => {
      const minutes = [59, 60, 119, 120, 179, 180, 600];

      const result = stats(
        minutes.map((m, i) => played(i + 1, m, `2026-11-0${i + 1}T08:00:00Z`, {}, m)),
      );

      expect(result.lengths.map((bucket) => bucket.sessions)).toEqual([1, 2, 2, 2]);
      expect(result.lengths.map((bucket) => bucket.result)).toEqual([
        59,
        60 + 119,
        120 + 179,
        180 + 600,
      ]);
    });

    it("averages with halves rounded away from zero", () => {
      const positive = stats([
        played(1, 1, "2026-11-06T20:00:00Z"),
        played(2, 2, "2026-11-13T20:00:00Z"),
      ]);

      expect(positive.weekdays[5]?.average).toBe(2);

      const negative = stats([
        played(1, -1, "2026-11-06T20:00:00Z"),
        played(2, -2, "2026-11-13T20:00:00Z"),
      ]);

      expect(negative.weekdays[5]?.average).toBe(-2);
    });

    it("leaves a weekday nobody played with no average", () => {
      expect(stats([played(1, 100, "2026-11-06T20:00:00Z")]).weekdays[0]).toEqual({
        index: 0,
        sessions: 0,
        result: 0,
        average: null,
      });
    });

    it("names the highest average, whatever its sign", () => {
      const friday = weekly(5, -20, "2026-11-06T20:00:00Z", 1);
      const saturday = weekly(5, -90, "2026-11-07T20:00:00Z", 20);

      expect(leadingBucket(stats([...friday, ...saturday]).weekdays)).toMatchObject({
        index: 5,
        sessions: 5,
        average: -20,
      });
    });

    it("needs 5 sessions in a bucket and 2 buckets over that floor", () => {
      const friday = weekly(5, 40, "2026-11-06T20:00:00Z", 1);
      const saturday = weekly(4, 90, "2026-11-07T20:00:00Z", 20);
      expect(leadingBucket(stats([...friday, ...saturday]).weekdays)).toBeNull();
      const sunday = weekly(5, 10, "2026-11-01T20:00:00Z", 40);

      expect(leadingBucket(stats([...friday, ...saturday, ...sunday]).weekdays)).toMatchObject({
        index: 5,
        average: 40,
      });
    });

    it("hides a sentence when two buckets tie for the highest average", () => {
      const friday = weekly(5, 50, "2026-11-06T20:00:00Z", 1);
      const saturday = weekly(6, 50, "2026-11-07T20:00:00Z", 20);
      const sunday = weekly(5, 10, "2026-11-01T20:00:00Z", 40);

      expect(leadingBucket(stats([...friday, ...saturday, ...sunday]).weekdays)).toBeNull();
    });

    it("names a clear leader even when the buckets below it tie", () => {
      const friday = weekly(5, 80, "2026-11-06T20:00:00Z", 1);
      const saturday = weekly(5, 10, "2026-11-07T20:00:00Z", 20);
      const sunday = weekly(5, 10, "2026-11-01T20:00:00Z", 40);

      expect(leadingBucket(stats([...friday, ...saturday, ...sunday]).weekdays)).toMatchObject({
        index: 5,
      });
    });

    it("compares lengths the same way", () => {
      const short = weekly(5, -30, "2026-11-06T20:00:00Z", 1, 30);
      const long = weekly(5, 120, "2026-11-07T20:00:00Z", 20, 200);

      expect(leadingBucket(stats([...short, ...long]).lengths)).toMatchObject({
        index: 3,
        average: 120,
      });
    });
  });

  describe("records", () => {
    it("picks the biggest win and the biggest loss", () => {
      const result = stats([
        played(1, 100, "2026-11-01T20:00:00Z", { game: "slots", venueId: otherCasino }),
        played(2, 900, "2026-11-02T20:00:00Z"),
        played(3, -50, "2026-11-03T20:00:00Z"),
        played(4, -700, "2026-11-04T20:00:00Z", { game: null, venueId: null }),
      ]);

      expect(result.records.win).toMatchObject({ result: 900, game: "blackjack", venueId: casino });
      expect(result.records.loss).toMatchObject({ result: -700, game: null, venueId: null });
      expect(result.records.win?.sessionId).toBe(result.runningResult[1]?.sessionId);
    });

    it("gives a tied record to the later session", () => {
      const result = stats([
        played(1, 500, "2026-11-01T20:00:00Z"),
        played(2, 500, "2026-11-02T20:00:00Z"),
        played(3, -500, "2026-11-03T20:00:00Z"),
        played(4, -500, "2026-11-04T20:00:00Z"),
      ]);

      expect(result.records.win?.sessionId).toBe(result.runningResult[1]?.sessionId);
      expect(result.records.loss?.sessionId).toBe(result.runningResult[3]?.sessionId);
    });

    it("follows the filters", () => {
      const sessions = [
        played(1, 900, "2026-11-02T20:00:00Z", { game: "slots" }),
        played(2, 100, "2026-11-03T20:00:00Z"),
      ];

      expect(stats(sessions, { game: "blackjack" }).records.win).toMatchObject({ result: 100 });
    });
  });
});
