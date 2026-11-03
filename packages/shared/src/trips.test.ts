import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";
import { SessionId, VenueId, type PlayerId } from "@stacks/contracts";

import { ALEX, BEA, CAL, DEE, money } from "./testing/ledgerArbitrary.ts";
import {
  inPlay,
  playerTrip,
  tonightBoard,
  tripAwards,
  tripFeed,
  tripNights,
  tripDays,
  tripRoute,
  tripStandings,
  tripStats,
  teamResult,
  type TripClock,
} from "./trips.ts";

// Tests run in UTC. A night runs from 6am to 6am.
const clock: TripClock = {
  night: (at) => new Date(DateTime.toEpochMillis(at) - 6 * 3_600_000).toISOString().slice(0, 10),
  hour: (at) => new Date(DateTime.toEpochMillis(at)).getUTCHours(),
};

const venue = (n: number) => ({
  id: VenueId.make(`0192e7a0-0000-7000-8000-0000000004${String(n).padStart(2, "0")}`),
});
let count = 0;
/** A session on October `day` at `hour` UTC (hours past 23 roll into the next day). */
const session = (
  day: number,
  hour: number,
  results: ReadonlyArray<[PlayerId, number, number?]>,
  at = 1,
) => ({
  session: {
    id: SessionId.make(`0192e7a0-0000-7000-8000-${String(++count).padStart(12, "0")}`),
    startedAt: DateTime.makeUnsafe(Date.UTC(2026, 9, day, hour)),
  },
  venue: venue(at),
  results: results.map(([playerId, net, buyIn]) => ({
    playerId,
    net: money(net),
    buyIn: money(buyIn ?? 0),
  })),
});

describe("tripNights", () => {
  it("counts a 2am session toward the night before", () => {
    const nights = tripNights(
      [
        session(21, 20, [[ALEX, 500]]),
        session(22, 2, [[BEA, 900]]),
        session(22, 19, [[ALEX, -100]]),
      ],
      clock,
    );
    expect(nights.map((n) => [n.key, n.number, n.sessions.length, n.winner])).toEqual([
      ["2026-10-21", 1, 2, { playerId: BEA, net: 900 }],
      ["2026-10-22", 2, 1, { playerId: ALEX, net: -100 }],
    ]);
  });
});

describe("tripStandings", () => {
  it("ranks by net and shows who moved since tonight began", () => {
    const standings = tripStandings(
      [
        session(21, 20, [
          [ALEX, 1000],
          [BEA, 200],
          [CAL, -300],
        ]),
        session(22, 20, [
          [BEA, 1500],
          [CAL, 500],
        ]),
      ],
      clock,
    );
    expect(standings).toEqual([
      {
        playerId: BEA,
        net: 1700,
        sessions: 2,
        rank: 1,
        moved: 1,
        hot: false,
        streak: { length: 2, winning: true },
      },
      {
        playerId: ALEX,
        net: 1000,
        sessions: 1,
        rank: 2,
        moved: -1,
        hot: false,
        streak: { length: 1, winning: true },
      },
      {
        playerId: CAL,
        net: 200,
        sessions: 2,
        rank: 3,
        moved: 0,
        hot: false,
        streak: { length: 1, winning: true },
      },
    ]);
  });

  it("marks three straight wins as hot", () => {
    const [alex] = tripStandings(
      [100, -50, 200, 300, 400].map((net, i) => session(21, 18 + i, [[ALEX, net]])),
      clock,
    );
    expect(alex?.hot).toBe(true);
    expect(alex?.streak).toEqual({ length: 3, winning: true });
  });

  it.prop(
    "ranks every player once, and the board adds up to the table",
    [
      Schema.Array(
        Schema.Array(Schema.Int.check(Schema.isBetween({ minimum: -5000, maximum: 5000 }))).check(
          Schema.isMaxLength(4),
        ),
      ).check(Schema.isMaxLength(12)),
    ],
    ([table]) => {
      const players = [ALEX, BEA, CAL, DEE];
      const sessions = table.map((nets, i) =>
        session(
          21 + Math.floor(i / 4),
          18 + (i % 4),
          nets.map((net, p) => [players[p]!, net]),
        ),
      );
      const standings = tripStandings(sessions, clock);
      expect(standings.map((s) => s.rank)).toEqual(standings.map((_, i) => i + 1));
      expect(standings.reduce((sum, s) => sum + s.net, 0)).toBe(
        table.flat().reduce((a, b) => a + b, 0),
      );
      for (let i = 1; i < standings.length; i++)
        expect(standings[i - 1]!.net).toBeGreaterThanOrEqual(standings[i]!.net);
      expect(standings.reduce((sum, s) => sum + s.moved, 0)).toBeLessThanOrEqual(0);
    },
  );
});

describe("tripAwards", () => {
  it("spreads awards so one hot player doesn't take them all", () => {
    const sessions = [
      session(
        21,
        20,
        [
          [ALEX, 5000],
          [BEA, 100],
        ],
        1,
      ),
      session(
        21,
        21,
        [
          [ALEX, 4000],
          [BEA, 200],
        ],
        2,
      ),
      session(
        21,
        22,
        [
          [ALEX, 3000],
          [BEA, -300],
        ],
        3,
      ),
    ];
    const awards = tripAwards(sessions, clock);
    expect(awards.map((a) => [a.key, a.playerId, a.value])).toEqual([
      ["biggest_hit", ALEX, 5000],
      ["heater", BEA, 2],
      ["hopper", ALEX, 3],
      ["rough_night", BEA, 300],
    ]);
  });

  it("finds the latest session of the night, the biggest buy-in and the comeback", () => {
    const sessions = [
      session(21, 21, [
        [ALEX, -2000, 2500],
        [BEA, 100],
      ]),
      session(22, 3, [
        [BEA, -50],
        [CAL, 10],
      ]),
      session(22, 4, [[ALEX, 3000]]),
    ];
    const awards = new Map(tripAwards(sessions, clock).map((a) => [a.key, a]));
    // Alex sat down latest, at 4am, but already holds awards, so the next owl gets it.
    expect(awards.get("night_owl")).toMatchObject({ playerId: BEA, value: 3 });
    expect(awards.get("comeback")).toMatchObject({ playerId: ALEX, value: 3000 });
    expect(awards.get("whale")).toMatchObject({ value: 2500 });
  });

  it("hands nothing out before anyone has played", () => {
    expect(tripAwards([], clock)).toEqual([]);
  });
});

describe("tripFeed", () => {
  it("lists the newest sessions' biggest swings first", () => {
    const feed = tripFeed([
      session(21, 20, [[ALEX, 100]]),
      session(21, 22, [
        [ALEX, -50],
        [BEA, 900],
        [CAL, 10],
      ]),
    ]);
    expect(feed.map((f) => [f.playerId, f.net])).toEqual([
      [BEA, 900],
      [ALEX, -50],
      [ALEX, 100],
    ]);
  });
});

/** A live table: each player's net and buy-in so far, and who's still playing. */
const table = (
  results: ReadonlyArray<[PlayerId, number, number]>,
  playing: ReadonlyArray<PlayerId>,
) => ({
  results: results.map(([playerId, net, buyIn]) => ({
    playerId,
    net: money(net),
    buyIn: money(buyIn),
  })),
  playing,
});

describe("inPlay", () => {
  it("adds up what each player still at a table has bought in for", () => {
    const tables = [
      table(
        [
          [ALEX, -300, 300],
          [BEA, 200, 100],
        ],
        [ALEX],
      ),
      table([[ALEX, -100, 100]], [ALEX]),
    ];
    expect(inPlay(tables)).toEqual(new Map([[ALEX, 400]]));
  });
});

describe("tonightBoard", () => {
  const now = DateTime.makeUnsafe(Date.UTC(2026, 9, 23, 1));

  it("ranks tonight's finished play and leaves earlier nights out", () => {
    const board = tonightBoard(
      [
        session(21, 20, [[ALEX, 5000]]),
        session(22, 20, [
          [ALEX, -200],
          [BEA, 300],
        ]),
        session(23, 0, [[CAL, 100]]),
      ],
      [],
      clock,
      now,
    );
    expect(board).toEqual([
      { playerId: BEA, net: 300, inPlay: 0, rank: 1 },
      { playerId: CAL, net: 100, inPlay: 0, rank: 2 },
      { playerId: ALEX, net: -200, inPlay: 0, rank: 3 },
    ]);
  });

  it("lists someone whose only play tonight is still going, with no result yet", () => {
    const board = tonightBoard([], [table([[ALEX, -300, 300]], [ALEX])], clock, now);
    expect(board).toEqual([{ playerId: ALEX, net: null, inPlay: 300, rank: 1 }]);
  });

  it("counts a cash-out at a live table, and shows what's still in play beside it", () => {
    const board = tonightBoard(
      [session(22, 20, [[ALEX, -200]])],
      [
        table(
          [
            [ALEX, -300, 300],
            [BEA, 150, 100],
            [DEE, -100, 100],
          ],
          [ALEX],
        ),
      ],
      clock,
      now,
    );
    // Alex's chips at the live table aren't a loss yet; Bea cashed out and Dee busted.
    expect(board).toEqual([
      { playerId: BEA, net: 150, inPlay: 0, rank: 1 },
      { playerId: DEE, net: -100, inPlay: 0, rank: 2 },
      { playerId: ALEX, net: -200, inPlay: 300, rank: 3 },
    ]);
  });
});

describe("teamResult", () => {
  it("is a win only when everyone who played won, and a loss only when everyone lost", () => {
    expect(
      teamResult(
        session(21, 20, [
          [ALEX, 500],
          [BEA, 10],
        ]),
      ),
    ).toBe("win");
    expect(
      teamResult(
        session(21, 20, [
          [ALEX, -500],
          [BEA, -10],
        ]),
      ),
    ).toBe("loss");
    expect(
      teamResult(
        session(21, 20, [
          [ALEX, 500],
          [BEA, -10],
        ]),
      ),
    ).toBe("mixed");
    expect(
      teamResult(
        session(21, 20, [
          [ALEX, 500],
          [BEA, 0],
        ]),
      ),
    ).toBe("mixed");
  });
});

describe("tripStats", () => {
  const trip = [
    {
      ...session(21, 20, [
        [ALEX, 500],
        [BEA, 100],
      ]),
      session: { ...session(21, 20, []).session, highLimit: true },
    },
    session(21, 22, [
      [ALEX, 300],
      [BEA, 200],
    ]),
    session(22, 20, [
      [ALEX, -900],
      [BEA, -100],
    ]),
    session(22, 22, [
      [ALEX, 400],
      [CAL, -50],
    ]),
    session(23, 20, [
      [BEA, -300],
      [CAL, -20],
    ]),
  ];

  it("adds up wins, losses, the record and the extremes", () => {
    const stats = tripStats(trip);
    expect(stats.sessions).toBe(5);
    expect(stats.net).toBe(130);
    expect(stats.grossWins).toBe(1500);
    expect(stats.grossLosses).toBe(-1370);
    expect(stats.record).toEqual({ wins: 2, losses: 2, mixed: 1 });
    expect(stats.winRate).toBe(0.4);
    expect(stats.average).toBe(26);
    expect(stats.best).toEqual({ playerId: ALEX, net: 500 });
    expect(stats.worst).toEqual({ playerId: ALEX, net: -900 });
  });

  it("measures the biggest fall from a high", () => {
    // Running totals: 600, 1100, 100, 450, 130. The high of 1100 fell to 100.
    expect(tripStats(trip).drawdown).toBe(-1000);
  });

  it("tracks the group's runs, which a mixed table ends", () => {
    expect(tripStats(trip).team).toEqual({
      current: { result: "loss", length: 1 },
      longestWin: 2,
      longestLoss: 1,
    });
  });

  it("splits high-limit play from the other tables", () => {
    const stats = tripStats(trip);
    expect(stats.highLimit).toEqual({ net: 600, sessions: 1 });
    expect(stats.otherTables).toEqual({ net: -470, sessions: 4 });
  });

  it("is all zeros before anyone plays", () => {
    const stats = tripStats([]);
    expect([stats.net, stats.drawdown, stats.winRate, stats.average]).toEqual([0, 0, 0, 0]);
    expect(stats.best).toBeNull();
  });

  const Nets = Schema.Array(Schema.Int.check(Schema.isBetween({ minimum: -5000, maximum: 5000 })));

  it.prop("never reports a drawdown deeper than the swings that made it", [Nets], ([nets]) => {
    const stats = tripStats(nets.map((n, i) => session(21, i, [[ALEX, n]])));
    const fall = nets.filter((n) => n < 0).reduce((sum, n) => sum + n, 0);
    expect(stats.drawdown).toBeLessThanOrEqual(0);
    expect(stats.drawdown).toBeGreaterThanOrEqual(fall);
    expect(stats.grossWins + stats.grossLosses).toBe(stats.net);
  });
});

describe("tripDays", () => {
  it("shows each player's night, and no result for anyone who sat it out", () => {
    const days = tripDays(
      [
        session(21, 20, [
          [ALEX, 500],
          [BEA, -100],
        ]),
        session(21, 23, [
          [ALEX, -200],
          [BEA, 0],
        ]),
        session(22, 20, [[BEA, 50]]),
      ],
      clock,
      [ALEX, BEA, CAL],
    );
    expect(days.map((d) => [d.number, d.sessions])).toEqual([
      [1, 2],
      [2, 1],
    ]);
    expect(days[0]!.rows).toEqual([
      { playerId: ALEX, net: 300, wins: 1, losses: 1, even: 0 },
      { playerId: BEA, net: -100, wins: 0, losses: 1, even: 1 },
      { playerId: CAL, net: null, wins: 0, losses: 0, even: 0 },
    ]);
    expect(days[1]!.rows.map((r) => [r.playerId, r.net])).toEqual([
      [BEA, 50],
      [ALEX, null],
      [CAL, null],
    ]);
  });
});

describe("tripRoute", () => {
  it("numbers each casino by first visit and keeps the path in playing order", () => {
    const route = tripRoute([
      session(21, 20, [[ALEX, 500]], 1),
      session(21, 22, [[ALEX, -100]], 1),
      session(22, 20, [[BEA, 300]], 2),
      session(22, 23, [[BEA, -50]], 1),
      session(23, 1, [[CAL, 40]], 3),
    ]);
    expect(route.stops.map((s) => [s.venue.id, s.number, s.visits, s.net])).toEqual([
      [venue(1).id, 1, 3, 350],
      [venue(2).id, 2, 1, 300],
      [venue(3).id, 3, 1, 40],
    ]);
    expect(route.path.map((v) => v.id)).toEqual([
      venue(1).id,
      venue(2).id,
      venue(1).id,
      venue(3).id,
    ]);
  });
});

describe("playerTrip", () => {
  it("draws one player's trip from zero, in the order they played, skipping tables they sat out", () => {
    const sessions = [
      session(22, 20, [
        [ALEX, 340],
        [BEA, 110],
      ]),
      session(21, 20, [
        [ALEX, -125],
        [BEA, 70],
      ]),
      session(21, 23, [[BEA, -40]]),
      session(21, 22, [[ALEX, 60]]),
    ];
    const trip = playerTrip(sessions, ALEX);
    expect(trip).toMatchObject({
      net: 275,
      line: [0, -125, -65, 275],
      played: 3,
      won: 2,
      low: -125,
    });
    expect(trip.best?.net).toBe(340);
    expect(trip.best?.session).toBe(sessions[0]);
  });

  it("is flat for someone who hasn't played", () => {
    expect(playerTrip([session(21, 20, [[BEA, 500]])], ALEX)).toEqual({
      net: 0,
      line: [0],
      played: 0,
      won: 0,
      low: 0,
      best: null,
    });
  });

  const Nets = Schema.Array(Schema.Int.check(Schema.isBetween({ minimum: -5000, maximum: 5000 })));

  it.prop("ends where their results add up to", [Nets], ([nets]) => {
    const trip = playerTrip(
      nets.map((n, i) => session(21, i, [[ALEX, n]])),
      ALEX,
    );
    expect(trip.line.at(-1)).toBe(trip.net);
    expect(trip.net).toBe(nets.reduce((sum, n) => sum + n, 0));
    expect(trip.line).toHaveLength(nets.length + 1);
    expect(trip.low).toBe(Math.min(...trip.line));
    expect(trip.won).toBe(nets.filter((n) => n > 0).length);
  });
});
