import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";
import { SessionId, VenueId, type PlayerId } from "@stacks/contracts";

import { ALEX, BEA, CAL, DEE, money } from "./testing/ledgerArbitrary.ts";
import {
  inPlay,
  tonightBoard,
  tripAwards,
  tripFeed,
  tripNights,
  tripStandings,
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
      { playerId: BEA, net: 1700, sessions: 2, rank: 1, moved: 1, hot: false },
      { playerId: ALEX, net: 1000, sessions: 1, rank: 2, moved: -1, hot: false },
      { playerId: CAL, net: 200, sessions: 2, rank: 3, moved: 0, hot: false },
    ]);
  });

  it("marks three straight wins as hot", () => {
    const [alex] = tripStandings(
      [100, -50, 200, 300, 400].map((net, i) => session(21, 18 + i, [[ALEX, net]])),
      clock,
    );
    expect(alex?.hot).toBe(true);
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
