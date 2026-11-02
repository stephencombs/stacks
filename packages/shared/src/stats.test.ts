import { describe, expect, it } from "@effect/vitest";
import type { PlayerId } from "@stacks/contracts";

import { ALEX, BEA, CAL } from "./testing/ledgerArbitrary.ts";
import { racePlaces, runningTotals, statSheet, type StatsSession } from "./stats.ts";

const palazzo = { id: "palazzo", name: "The Palazzo" };
const wynn = { id: "wynn", name: "Wynn" };
const session = (
  venue: StatsSession["venue"],
  results: ReadonlyArray<[PlayerId, number, number?]>,
): StatsSession => ({
  venue,
  results: results.map(([playerId, net, buyIn]) => ({ playerId, net, buyIn: buyIn ?? 0 })),
});

describe("racePlaces", () => {
  it("ranks by running total after each session", () => {
    const places = racePlaces(
      [
        session(palazzo, [
          [ALEX, 100],
          [BEA, 300],
        ]),
        session(wynn, [[ALEX, 500]]),
      ],
      [ALEX, BEA, CAL],
    );
    expect(places.map((p) => [p.get(ALEX), p.get(BEA), p.get(CAL)])).toEqual([
      [1, 0, 2],
      [0, 1, 2],
    ]);
  });

  it("keeps the earlier order on a tie, so nobody moves without passing someone", () => {
    const places = racePlaces(
      [session(palazzo, [[BEA, 100]]), session(wynn, [[ALEX, 100]])],
      [ALEX, BEA],
    );
    expect(places.map((p) => [p.get(ALEX), p.get(BEA)])).toEqual([
      [1, 0],
      [1, 0],
    ]);
  });
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
