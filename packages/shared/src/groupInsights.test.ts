import { describe, expect, it } from "@effect/vitest";
import { TripId, type PlayerId } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";

import { ALEX, BEA, CAL, DEE } from "./testing/ledgerArbitrary.ts";
import {
  BEST_HOURLY_MIN_HOURS,
  groupRecords,
  lateNight,
  nightResults,
  returnStandings,
  sharedVsSolo,
  sweeps,
  tablemates,
  tripResults,
  tripWins,
  type GroupPlay,
  type TripSpan,
} from "./stats.ts";
import type { TripClock } from "./trips.ts";

const utc = DateTime.zoneMakeNamedUnsafe("UTC");
const vegas = TripId.make("0192e7a0-0000-7000-8000-000000000501");
const reno = TripId.make("0192e7a0-0000-7000-8000-000000000502");
const tahoe = TripId.make("0192e7a0-0000-7000-8000-000000000503");

const at = (iso: string) => DateTime.makeUnsafe(iso);
const HOUR = 3_600_000;

let count = 0;

const play = (
  results: ReadonlyArray<readonly [PlayerId, number, number?, number?]>,
  fields: { at?: string; tripId?: TripId } = {},
) => {
  const startedAt = at(fields.at ?? "2026-10-21T20:00:00Z");

  return {
    id: `play-${String(++count).padStart(4, "0")}`,
    tripId: fields.tripId ?? vegas,
    game: "blackjack",
    venueId: null,
    startedAt,
    endedAt: DateTime.makeUnsafe(DateTime.toEpochMillis(startedAt) + HOUR),
    results: results.map(([playerId, net, buyIn, minutes]) => ({
      playerId,
      net,
      buyIn: buyIn ?? Math.max(0, -net),
      milliseconds: (minutes ?? 60) * 60_000,
    })),
  } satisfies GroupPlay;
};

const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}T20:00:00Z`;

const span = (tripId: TripId, startedAt: string, endedAt: string | null) =>
  ({
    id: tripId,
    startedAt: at(startedAt),
    endedAt: endedAt === null ? null : at(endedAt),
  }) satisfies TripSpan;

describe("tripResults", () => {
  const trips = [
    span(vegas, "2026-10-01T00:00:00Z", "2026-10-05T00:00:00Z"),
    span(reno, "2026-11-01T00:00:00Z", "2026-11-04T00:00:00Z"),
    span(tahoe, "2026-12-01T00:00:00Z", null),
  ];

  it("totals each trip and names the leader, oldest trip first", () => {
    const rows = tripResults(
      [
        play(
          [
            [ALEX, 300],
            [BEA, -100],
          ],
          { tripId: reno, at: "2026-11-02T20:00:00Z" },
        ),
        play(
          [
            [ALEX, -50],
            [BEA, 200],
          ],
          { tripId: vegas, at: day(2) },
        ),
      ],
      trips,
    );

    expect(rows.map((row) => [row.tripId, row.result, row.leaders, row.ended])).toEqual([
      [vegas, 150, [BEA], true],
      [reno, 200, [ALEX], true],
    ]);
    expect(rows[0]).toMatchObject({ tables: 1, players: 2, leaderResult: 200 });
  });

  it("shares a tie for first and gives a one-player trip no leader", () => {
    const [tied, solo] = tripResults(
      [
        play(
          [
            [ALEX, 100],
            [BEA, 100],
            [CAL, -40],
          ],
          { tripId: vegas, at: day(2) },
        ),
        play([[ALEX, 500]], { tripId: reno, at: "2026-11-02T20:00:00Z" }),
      ],
      trips,
    );

    expect(tied!.leaders).toEqual([ALEX, BEA]);
    expect(solo).toMatchObject({ leaders: [], players: 1, result: 500 });
  });

  it("keeps a trip where everyone lost, with the highest result as its leader", () => {
    const [row] = tripResults(
      [
        play(
          [
            [ALEX, -300],
            [BEA, -40],
          ],
          { at: day(2) },
        ),
      ],
      trips,
    );

    expect(row).toMatchObject({ result: -340, leaders: [BEA], leaderResult: -40 });
  });

  it("reads an all-zero trip as zero, not as a missing one", () => {
    const [row] = tripResults(
      [
        play(
          [
            [ALEX, 0],
            [BEA, 0],
          ],
          { at: day(2) },
        ),
      ],
      trips,
    );

    expect(row).toMatchObject({ result: 0, played: true, leaders: [ALEX, BEA] });
  });

  it("treats an active trip, and a reopened one, as not final", () => {
    const rows = tripResults(
      [
        play(
          [
            [ALEX, 100],
            [BEA, 50],
          ],
          { tripId: tahoe, at: "2026-12-02T20:00:00Z" },
        ),
        play(
          [
            [ALEX, 100],
            [BEA, 50],
          ],
          { tripId: reno, at: "2026-11-02T20:00:00Z" },
        ),
      ],
      [...trips.slice(0, 1), span(reno, "2026-11-01T00:00:00Z", null), trips[2]!],
    );

    expect(rows.map((row) => [row.tripId, row.ended])).toEqual([
      [reno, false],
      [tahoe, false],
    ]);
  });

  it("counts a trip the group no longer lists as an ended one", () => {
    const [row] = tripResults([play([[ALEX, 5]], { tripId: tahoe })], []);

    expect(row!.ended).toBe(true);
  });

  it.prop(
    "splits the group's result exactly across its trips",
    [
      Schema.Array(
        Schema.Struct({
          trip: Schema.Literals([vegas, reno, tahoe]),
          nets: Schema.Array(Schema.Int.check(Schema.isBetween({ minimum: -1e6, maximum: 1e6 }))),
        }),
      ),
    ],
    ([specs]) => {
      const plays = specs.map(({ trip, nets }, i) =>
        play(
          nets.map((net, p) => [[ALEX, BEA, CAL, DEE][p % 4]!, net] as const),
          { tripId: trip, at: day(1 + (i % 28)) },
        ),
      );

      const total = plays.reduce((sum, p) => sum + p.results.reduce((s, r) => s + r.net, 0), 0);
      const rows = tripResults(plays, trips);

      expect(rows.reduce((sum, row) => sum + row.result, 0)).toBe(total);
    },
  );
});

describe("tripWins", () => {
  const ended = (
    tripId: TripId,
    started: string,
    results: ReadonlyArray<readonly [PlayerId, number]>,
  ) => ({
    plays: [play(results, { tripId, at: started })],
    span: span(tripId, started, "2027-01-01T00:00:00Z"),
  });

  const wins = (...rows: Array<{ plays: Array<GroupPlay>; span: TripSpan }>) =>
    tripWins(
      tripResults(
        rows.flatMap((row) => row.plays),
        rows.map((row) => row.span),
      ),
    );

  const duel = (a: number, b: number) =>
    [
      [ALEX, a],
      [BEA, b],
    ] as const;

  it("names who won the most ended trips, counting a co-win for each player", () => {
    expect(
      wins(ended(vegas, day(2), duel(100, 0)), ended(reno, "2026-11-02T20:00:00Z", duel(100, 100))),
    ).toEqual({ ended: 2, leader: { playerId: ALEX, wins: 2 } });
  });

  it("hides on a tie for most wins, and below two ended trips", () => {
    expect(
      wins(ended(vegas, day(2), duel(100, 100)), ended(reno, "2026-11-02T20:00:00Z", duel(5, 5)))
        .leader,
    ).toBeNull();
    expect(
      wins(ended(vegas, day(2), duel(100, 0)), ended(reno, "2026-11-02T20:00:00Z", duel(0, 100)))
        .leader,
    ).toBeNull();
    expect(wins(ended(vegas, day(2), duel(100, 0))).leader).toBeNull();
  });

  it("doesn't count an active trip", () => {
    const [first, second] = [
      ended(vegas, day(2), duel(100, 0)),
      ended(reno, "2026-11-02T20:00:00Z", duel(0, 100)),
    ];

    const active = {
      plays: [play(duel(10, 0), { tripId: tahoe, at: "2026-12-02T20:00:00Z" })],
      span: span(tahoe, "2026-12-01T00:00:00Z", null),
    };

    expect(wins(first, active)).toMatchObject({ ended: 1, leader: null });
    expect(wins(first, second, active).ended).toBe(2);
  });
});

describe("nightResults", () => {
  it("breaks nights at 06:00 and leaves a gap for a night nobody played", () => {
    const rows = nightResults(
      [
        play(
          [
            [ALEX, 100],
            [BEA, -20],
          ],
          { at: "2026-10-01T22:00:00Z" },
        ),
        play([[ALEX, -50]], { at: "2026-10-02T03:00:00Z" }),
        play([[BEA, 300]], { at: "2026-10-04T20:00:00Z" }),
      ],
      utc,
    );

    expect(rows!.map((row) => [row.key, row.result, row.played, row.leaders])).toEqual([
      ["2026-10-01", 30, true, [ALEX]],
      ["2026-10-02", 0, false, []],
      ["2026-10-03", 0, false, []],
      ["2026-10-04", 300, true, []],
    ]);
  });

  it("is no chart with fewer than two nights", () => {
    expect(
      nightResults(
        [
          play([[ALEX, 1]], { at: "2026-10-01T20:00:00Z" }),
          play([[ALEX, 1]], { at: "2026-10-02T03:00:00Z" }),
        ],
        utc,
      ),
    ).toBeNull();
  });
});

describe("tablemates", () => {
  it("names the pair with the most shared tables, the more recent shared play winning a tie", () => {
    const plays = [
      play(
        [
          [ALEX, 100],
          [BEA, -30],
        ],
        { at: day(1) },
      ),
      play(
        [
          [ALEX, 10],
          [BEA, 20],
        ],
        { at: day(2) },
      ),
      play(
        [
          [CAL, 5],
          [DEE, 6],
        ],
        { at: day(3) },
      ),
      play(
        [
          [CAL, 1],
          [DEE, 2],
        ],
        { at: day(4) },
      ),
    ];

    expect(tablemates(plays, ALEX).pair).toEqual({
      playerIds: [CAL, DEE],
      tables: 2,
      result: 14,
    });
  });

  it("needs two shared tables for a pair", () => {
    expect(
      tablemates(
        [
          play([
            [ALEX, 1],
            [BEA, 2],
          ]),
        ],
        ALEX,
      ).pair,
    ).toBeNull();
  });

  const withBea = (together: number, apart: number) => [
    ...Array.from({ length: together }, (_, i) =>
      play(
        [
          [ALEX, 100],
          [BEA, -10],
        ],
        { at: day(1 + i) },
      ),
    ),
    ...Array.from({ length: apart }, (_, i) => play([[ALEX, 20]], { at: day(10 + i) })),
  ];

  it("averages your result with and without a friend once each side has five plays", () => {
    expect(tablemates(withBea(5, 5), ALEX).withWithout).toEqual({
      friend: BEA,
      withCount: 5,
      withoutCount: 5,
      withAverage: 100,
      withoutAverage: 20,
    });
  });

  it("stays hidden at four plays on either side", () => {
    expect(tablemates(withBea(4, 5), ALEX).withWithout).toBeNull();
    expect(tablemates(withBea(5, 4), ALEX).withWithout).toBeNull();
  });

  it("stays hidden unless a friend's gap is positive", () => {
    const plays = [
      ...Array.from({ length: 5 }, (_, i) =>
        play(
          [
            [ALEX, -100],
            [BEA, 5],
          ],
          { at: day(1 + i) },
        ),
      ),
      ...Array.from({ length: 5 }, (_, i) => play([[ALEX, 20]], { at: day(10 + i) })),
    ];

    expect(tablemates(plays, ALEX).withWithout).toBeNull();
  });

  it("picks the friend with the largest positive gap", () => {
    const plays = [
      ...Array.from({ length: 5 }, (_, i) =>
        play(
          [
            [ALEX, 100],
            [BEA, 0],
          ],
          { at: day(1 + i) },
        ),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        play(
          [
            [ALEX, 300],
            [CAL, 0],
          ],
          { at: day(8 + i) },
        ),
      ),
    ];

    expect(tablemates(plays, ALEX).withWithout).toMatchObject({
      friend: CAL,
      withAverage: 300,
      withoutAverage: 100,
    });
  });

  it("counts who finished higher against the friend you share most plays with", () => {
    const plays = [
      play(
        [
          [ALEX, 50],
          [BEA, 10],
        ],
        { at: day(1) },
      ),
      play(
        [
          [ALEX, 50],
          [BEA, 10],
        ],
        { at: day(2) },
      ),
      play(
        [
          [ALEX, -5],
          [BEA, 10],
        ],
        { at: day(3) },
      ),
      play(
        [
          [ALEX, 7],
          [BEA, 7],
        ],
        { at: day(4) },
      ),
      play(
        [
          [ALEX, 1],
          [BEA, 7],
          [CAL, 0],
        ],
        { at: day(5) },
      ),
    ];

    expect(tablemates(plays, ALEX).headToHead).toEqual({
      friend: BEA,
      tables: 5,
      ahead: 2,
      behind: 2,
      tied: 1,
    });
    expect(tablemates(plays.slice(1), ALEX).headToHead).toBeNull();
  });
});

describe("sweeps", () => {
  it("is nothing without a table everyone finished up at", () => {
    expect(
      sweeps([
        play([
          [ALEX, 100],
          [BEA, 0],
        ]),
        play([[ALEX, 100]]),
      ]),
    ).toBeNull();
  });

  it("counts tables of two or more players who all finished up, and finds the best", () => {
    const best = play(
      [
        [ALEX, 200],
        [BEA, 300],
      ],
      { at: day(3) },
    );

    expect(
      sweeps([
        play(
          [
            [ALEX, 10],
            [BEA, 20],
          ],
          { at: day(1) },
        ),
        best,
        play([[ALEX, 900]], { at: day(4) }),
        play(
          [
            [ALEX, 400],
            [BEA, 100],
          ],
          { at: day(2) },
        ),
      ]),
    ).toMatchObject({ count: 3, result: 500, play: { id: best.id } });
  });

  it("shows the one all-positive three-player play", () => {
    expect(
      sweeps([
        play([
          [ALEX, 100],
          [BEA, 50],
          [CAL, 1],
        ]),
      ]),
    ).toMatchObject({ count: 1, result: 151 });
  });
});

describe("sharedVsSolo", () => {
  const shared = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      play(
        [
          [ALEX, 100],
          [BEA, 50],
        ],
        { at: day(1 + i) },
      ),
    );

  const solo = (n: number) =>
    Array.from({ length: n }, (_, i) => play([[ALEX, -25]], { at: day(10 + i) }));

  it("compares per-appearance averages once each side has five plays", () => {
    expect(sharedVsSolo([...shared(5), ...solo(5)])).toEqual({
      shared: { plays: 5, appearances: 10, result: 750, average: 75 },
      solo: { plays: 5, appearances: 5, result: -125, average: -25 },
    });
  });

  it("switches on at five and off at four", () => {
    expect(sharedVsSolo([...shared(4), ...solo(5)])).toBeNull();
    expect(sharedVsSolo([...shared(5), ...solo(4)])).toBeNull();
  });

  it("rounds an average half away from zero", () => {
    const rows = sharedVsSolo([...shared(5), ...solo(4), play([[ALEX, -26]], { at: day(20) })]);

    expect(rows!.solo.average).toBe(-25);
    expect(
      sharedVsSolo([
        ...shared(5),
        ...Array.from({ length: 4 }, (_, i) => play([[ALEX, 1]], { at: day(10 + i) })),
        play([[ALEX, 0]], { at: day(20) }),
      ])!.solo.average,
    ).toBe(1);
  });
});

describe("lateNight", () => {
  const clockIn = (timeZone: string) => {
    const format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
    });

    return {
      night: () => "",
      hour: (moment) => Number(format.format(DateTime.toEpochMillis(moment))),
    } satisfies TripClock;
  };

  const utcClock = clockIn("UTC");

  const rowsAt = (starts: ReadonlyArray<string>, net = 10) =>
    starts.map((startedAt) =>
      play(
        [
          [ALEX, net],
          [BEA, net],
        ],
        { at: startedAt },
      ),
    );

  const lateStarts = ["2026-10-02T00:00:00Z", "2026-10-03T00:00:00Z", "2026-10-04T01:30:00Z"];

  const daytime = ["2026-10-05T12:00:00Z", "2026-10-06T12:00:00Z", "2026-10-07T12:00:00Z"];

  it("counts a start from 00:00 up to 05:59 as late, and 06:00 as not", () => {
    const result = lateNight(
      rowsAt([...lateStarts, "2026-10-08T05:59:00Z", "2026-10-09T06:00:00Z", ...daytime]),
      utcClock,
    );

    expect(result!.late).toMatchObject({ plays: 4, appearances: 8 });
    expect(result!.other).toMatchObject({ plays: 4, appearances: 8 });
  });

  it("holds the 06:00 edge across daylight-saving changes", () => {
    const result = lateNight(
      rowsAt([
        "2026-03-08T09:59:00Z",
        "2026-03-08T07:30:00Z",
        "2026-03-09T05:00:00Z",
        "2026-11-01T10:00:00Z",
        "2026-03-08T10:00:00Z",
        "2026-03-08T16:00:00Z",
        "2026-03-10T16:00:00Z",
      ]),
      clockIn("America/New_York"),
    );

    expect(result!.late.plays).toBe(4);
    expect(result!.other.plays).toBe(3);
  });

  it("needs five appearances over three plays on each side", () => {
    expect(lateNight(rowsAt([...lateStarts, ...daytime]), utcClock)).not.toBeNull();
    expect(lateNight(rowsAt([...lateStarts.slice(0, 2), ...daytime]), utcClock)).toBeNull();
    expect(lateNight(rowsAt([...lateStarts, ...daytime.slice(0, 2)]), utcClock)).toBeNull();

    const solos = (starts: ReadonlyArray<string>) =>
      starts.map((startedAt) => play([[ALEX, 10]], { at: startedAt }));

    expect(lateNight([...solos(lateStarts), ...solos(daytime)], utcClock)).toBeNull();
    expect(
      lateNight(
        [...solos(lateStarts), ...rowsAt(daytime), ...solos(["2026-10-12T12:00:00Z"])],
        utcClock,
      ),
    ).toBeNull();
  });

  it("averages each side per appearance", () => {
    const result = lateNight([...rowsAt(lateStarts, 30), ...rowsAt(daytime, -10)], utcClock);

    expect(result).toMatchObject({
      late: { average: 30, result: 180 },
      other: { average: -10, result: -60 },
    });
  });
});

describe("groupRecords", () => {
  it("needs two plays", () => {
    expect(groupRecords([play([[ALEX, 5]])])).toBeNull();
  });

  it("finds the biggest win and loss and the longest stay, the earliest taking a tie", () => {
    const first = play(
      [
        [ALEX, 400, 100, 90],
        [BEA, -400, 400, 60],
      ],
      { at: day(1) },
    );

    const second = play(
      [
        [ALEX, 400, 100, 90],
        [BEA, -400, 400, 60],
      ],
      { at: day(2) },
    );

    const records = groupRecords([second, first]);

    expect(records!.win).toMatchObject({ playerId: ALEX, value: 400, play: { id: first.id } });
    expect(records!.loss).toMatchObject({ playerId: BEA, value: -400, play: { id: first.id } });
    expect(records!.longest).toMatchObject({
      playerId: ALEX,
      value: 90 * 60_000,
      play: { id: first.id },
    });
  });

  it("has no win when nobody won, no loss when nobody lost, and no stay when nobody played", () => {
    const records = groupRecords([play([[ALEX, 0, 0, 0]]), play([[BEA, -5, 5, 0]])]);

    expect(records).toMatchObject({ win: null, longest: null });
    expect(records!.loss).toMatchObject({ value: -5 });
    expect(groupRecords([play([[ALEX, 5, 0, 0]]), play([[BEA, 5, 0, 0]])])!.loss).toBeNull();
  });

  it(`ranks per-hour results from ${BEST_HOURLY_MIN_HOURS} hours played`, () => {
    const long = (net: number, player: PlayerId, minutes: number, n: number) =>
      play([[player, net, 0, minutes]], { at: day(n) });

    const records = groupRecords([
      long(1000, ALEX, 300, 1),
      long(1000, ALEX, 299, 2),
      long(900, BEA, 600, 3),
      long(900, BEA, 60, 4),
    ]);

    expect(records!.hourly).toMatchObject({ playerId: BEA, value: 164, milliseconds: 11 * HOUR });
    expect(groupRecords([long(1000, ALEX, 300, 1), long(1000, ALEX, 299, 2)])!.hourly).toBeNull();
  });

  it("rounds a per-hour result half away from zero", () => {
    const records = groupRecords([
      play([[ALEX, -1, 0, 600]], { at: day(1) }),
      play([[ALEX, 0, 0, 300]], { at: day(2) }),
    ]);

    expect(records!.hourly).toMatchObject({ value: 0 });
  });
});

describe("returnStandings", () => {
  const stake = (player: PlayerId, net: number, buyIn: number, n: number) =>
    play([[player, net, buyIn]], { at: day(n) });

  const run = (player: PlayerId, net: number, buyIn: number, times = 3) =>
    Array.from({ length: times }, (_, i) => stake(player, net, buyIn, 1 + i));

  it("ranks mixed stakes by result over buy-in, not by money", () => {
    const rows = returnStandings([
      ...run(ALEX, 100, 100),
      ...run(BEA, 500, 2000),
      ...run(CAL, -50, 500),
    ]);

    expect(rows.map((row) => [row.playerId, row.rank, row.result, row.buyIn])).toEqual([
      [ALEX, 1, 300, 300],
      [BEA, 2, 1500, 6000],
      [CAL, 3, -150, 1500],
    ]);
  });

  it("shares a rank between equal ratios, however different the money", () => {
    const rows = returnStandings([
      ...run(ALEX, 50, 100),
      ...run(BEA, 500, 1000),
      ...run(CAL, 1, 100),
    ]);

    expect(rows.map((row) => [row.playerId, row.rank])).toEqual([
      [ALEX, 1],
      [BEA, 1],
      [CAL, 3],
    ]);
  });

  it("leaves out anyone with fewer than three appearances or nothing bought in", () => {
    const rows = returnStandings([
      ...run(ALEX, 10, 100),
      ...run(BEA, 10, 100, 2),
      ...run(CAL, 10, 0),
    ]);

    expect(rows.map((row) => row.playerId)).toEqual([ALEX]);
  });

  it("compares ratios exactly where a float would tie them", () => {
    const rows = returnStandings([
      ...run(ALEX, 1, 3_000_000_001_000),
      ...run(BEA, 1, 3_000_000_000_000),
    ]);

    expect(rows.map((row) => [row.playerId, row.rank])).toEqual([
      [BEA, 1],
      [ALEX, 2],
    ]);
  });
});
