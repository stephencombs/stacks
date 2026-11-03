import { describe, expect, it } from "@effect/vitest";
import type { PlayerId } from "@stacks/contracts";
import * as Schema from "effect/Schema";

import { ALEX, BEA, CAL } from "./testing/ledgerArbitrary.ts";
import { raceLines, runningReturns, runningTotals, statSheet, type StatsSession } from "./stats.ts";

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

  it("leaves out what never happened: no winning session, no recorded buy-in", () => {
    const sheet = statSheet([session(wynn, [[ALEX, -50]])], ALEX)!;
    expect(sheet.best).toBeNull();
    expect(sheet.bestVenue).toBeNull();
    expect(sheet.averageBuyIn).toBeNull();
  });
});
