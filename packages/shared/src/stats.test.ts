import { describe, expect, it } from "@effect/vitest";
import { Game, MinorUnits, TripId, VenueId, VisitId, type PlayerId } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";

import { ALEX, BEA, CAL, RandomLedger, toEntries } from "./testing/ledgerArbitrary.ts";
import { visit } from "./testing/recording.ts";
import { playerResults } from "./results.ts";
import {
  personalStats,
  raceLines,
  runningReturns,
  runningTotals,
  statSheet,
  type StatsSession,
} from "./stats.ts";

const palazzo = { id: "palazzo", name: "The Palazzo" };
const wynn = { id: "wynn", name: "Wynn" };
const session = (
  venue: StatsSession["venue"],
  results: ReadonlyArray<[PlayerId, number, number?]>,
): StatsSession => ({
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

describe("statSheet", () => {
  it("is null for a player who sat everything out", () => {
    expect(statSheet([session(palazzo, [[ALEX, 100]])], BEA)).toBeNull();
  });

  it("finds the best and worst sessions, best casino and average buy-in", () => {
    const sheet = statSheet(
      [
        session(palazzo, [[ALEX, 300, 200]]),
        session(wynn, [[ALEX, -500, 400]]),
        session(palazzo, [[ALEX, 100]]),
      ],
      ALEX,
    )!;
    expect(sheet.total).toBe(-100);
    expect(sheet.best?.net).toBe(300);
    expect(sheet.worst?.net).toBe(-500);
    expect(sheet.bestVenue).toEqual({ name: "The Palazzo", net: 400, sessions: 2 });
    expect(sheet.venues).toBe(2);
    expect(sheet.averageBuyIn).toBe(300);
    expect(sheet.runs.wins).toBe(2);
  });

  it("leaves a session with no casino set out of the casinos", () => {
    const sheet = statSheet([session(null, [[ALEX, 900]]), session(wynn, [[ALEX, 100]])], ALEX)!;
    expect(sheet.total).toBe(1000);
    expect(sheet.bestVenue).toEqual({ name: "Wynn", net: 100, sessions: 1 });
    expect(sheet.venues).toBe(1);
    expect(statSheet([session(null, [[ALEX, 900]])], ALEX)).toMatchObject({
      bestVenue: null,
      venues: 0,
    });
  });

  it("leaves out what never happened: no winning session, no recorded buy-in", () => {
    const sheet = statSheet([session(wynn, [[ALEX, -50]])], ALEX)!;
    expect(sheet.best).toBeNull();
    expect(sheet.bestVenue).toBeNull();
    expect(sheet.averageBuyIn).toBeNull();
  });
});

const zone = DateTime.zoneMakeNamedUnsafe("America/Los_Angeles");
const casino = VenueId.make("0192e7a0-0000-7000-8000-0000000000c1");
const otherCasino = VenueId.make("0192e7a0-0000-7000-8000-0000000000c2");
const missingCasino = VenueId.make("0192e7a0-0000-7000-8000-0000000000c3");
const vegasTrip = TripId.make("0192e7a0-0000-7000-8000-0000000000d1");
const renoTrip = TripId.make("0192e7a0-0000-7000-8000-0000000000d2");
const personalSession = (
  id: number,
  result: number,
  fields: {
    startedAt?: string;
    finishedAt?: string | null;
    game?: typeof Game.Type | null;
    venueId?: VenueId | null;
    tripId?: TripId | null;
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
    // Most recently played first.
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
        hourlyResult: 0,
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

  it("rounds hourly halves away from zero and returns zero for zero elapsed time", () => {
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
      hourlyResult: 0,
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
    const sessions = [personalSession(1, max), personalSession(2, -max), personalSession(3, 2)];
    expect(personalStats(sessions, zone).summary.result).toBe(2);
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
