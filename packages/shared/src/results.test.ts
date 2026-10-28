import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";
import { SessionId } from "@stacks/contracts";

import { playerResults, resultsBy, runningNet, sessionCounts, sessionRuns } from "./results.ts";
import { ALEX, BEA, RandomLedger, entry, money, toEntries } from "./testing/ledgerArbitrary.ts";

describe("playerResults", () => {
  it("nets cash-outs and adjustments against buy-ins", () => {
    const results = playerResults([
      entry({ kind: "buy_in", playerId: ALEX, amount: money(10000) }),
      entry({ kind: "buy_in", playerId: ALEX, amount: money(5000), counterpartyId: BEA }),
      entry({ kind: "cash_out", playerId: ALEX, amount: money(32000) }),
      entry({ kind: "adjustment", playerId: ALEX, amount: money(-500) }),
      entry({ kind: "buy_in", playerId: BEA, amount: money(20000) }),
      entry({ kind: "cash_out", playerId: BEA, amount: money(1) }),
    ]);

    expect(results.get(ALEX)).toEqual({
      buyIn: 15000,
      cashOut: 32000,
      adjustment: -500,
      net: 16500,
    });
    expect(results.get(BEA)?.net).toBe(-19999);
  });

  it("ignores voided entries and settlements", () => {
    const results = playerResults([
      entry({ kind: "buy_in", playerId: ALEX, amount: money(10000) }),
      entry({
        kind: "buy_in",
        playerId: ALEX,
        amount: money(10000),
        voidedAt: DateTime.makeUnsafe("2026-10-01T00:00:00Z"),
      }),
      entry({ kind: "settlement", playerId: ALEX, amount: money(4000), counterpartyId: BEA }),
    ]);

    expect(results.get(ALEX)?.net).toBe(-10000);
    expect(results.has(BEA)).toBe(false);
  });
});

describe("resultsBy", () => {
  const blackjack = {
    id: SessionId.make("0192e7a0-0000-7000-8000-0000000000b1"),
    game: "blackjack",
  };
  const craps = { id: SessionId.make("0192e7a0-0000-7000-8000-0000000000c1"), game: "craps" };
  const lastYear = { id: SessionId.make("0192e7a0-0000-7000-8000-0000000000c2"), game: "craps" };
  const entries = [
    { ...entry({ kind: "buy_in", playerId: ALEX, amount: money(10000) }), sessionId: blackjack.id },
    {
      ...entry({ kind: "cash_out", playerId: ALEX, amount: money(25000) }),
      sessionId: blackjack.id,
    },
    { ...entry({ kind: "buy_in", playerId: ALEX, amount: money(5000) }), sessionId: craps.id },
    { ...entry({ kind: "buy_in", playerId: ALEX, amount: money(99900) }), sessionId: lastYear.id },
    {
      ...entry({ kind: "settlement", playerId: ALEX, amount: money(1), counterpartyId: BEA }),
      sessionId: null,
    },
  ];

  it("splits results by the key and counts only the given sessions", () => {
    const byGame = resultsBy([blackjack, craps], entries, (session) => session.game);

    expect(byGame.get("blackjack")?.get(ALEX)?.net).toBe(15000);
    expect(byGame.get("craps")?.get(ALEX)?.net).toBe(-5000);
  });
});

describe("runningNet", () => {
  const session = (
    name: string,
    ...results: ReadonlyArray<{ playerId: typeof ALEX; net: number }>
  ) => ({
    name,
    results: results.map((result) => ({ ...result, net: money(result.net) })),
  });

  it("keeps a running total over the sessions the player played, in order", () => {
    const points = runningNet(
      [
        session("first", { playerId: ALEX, net: 5000 }, { playerId: BEA, net: -5000 }),
        session("bea alone", { playerId: BEA, net: 100 }),
        session("second", { playerId: ALEX, net: -8000 }),
        session("third", { playerId: ALEX, net: 0 }),
      ],
      ALEX,
    );

    expect(points.map((point) => [point.session.name, point.net, point.total])).toEqual([
      ["first", 5000, 5000],
      ["second", -8000, -3000],
      ["third", 0, -3000],
    ]);
  });

  it("is empty for a player who never played", () => {
    expect(runningNet([session("first", { playerId: BEA, net: 100 })], ALEX)).toEqual([]);
  });

  it.prop(
    "ends at the player's all-time net",
    [RandomLedger, Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 6 }))],
    ([ledger, sessionCount]) => {
      const sessions = Array.from({ length: sessionCount }, (_, index) => ({
        id: SessionId.make(`0192e7a0-0000-7000-8000-0000000001${String(index).padStart(2, "0")}`),
      }));
      const entries = toEntries(ledger).map((e, index) => ({
        ...e,
        sessionId: sessions[index % sessionCount]!.id,
      }));
      const bySession = resultsBy(sessions, entries, (s) => s.id);
      const timeline = sessions.map((s) => ({
        results: Array.from(bySession.get(s.id) ?? [], ([playerId, result]) => ({
          playerId,
          ...result,
        })),
      }));

      for (const [playerId, result] of playerResults(entries)) {
        expect(runningNet(timeline, playerId).at(-1)?.total).toBe(result.net);
      }
    },
  );
});

describe("sessionCounts", () => {
  it("counts the sessions each player has a result in", () => {
    const counts = sessionCounts([
      { results: [{ playerId: ALEX }, { playerId: BEA }] },
      { results: [{ playerId: ALEX }] },
      { results: [] },
    ]);
    expect(counts).toEqual(
      new Map([
        [ALEX, 2],
        [BEA, 1],
      ]),
    );
  });
});

describe("sessionRuns", () => {
  it("finds the longest winning run and the run the latest session is on", () => {
    expect(sessionRuns([100, 200, -50, 300, 400, 500, -10, -20])).toEqual({
      sessions: 8,
      wins: 5,
      longestWinningRun: 3,
      current: { length: 2, winning: false },
    });
  });

  it("lets an even session break a run", () => {
    expect(sessionRuns([100, 0, 100, 100])).toMatchObject({
      longestWinningRun: 2,
      current: { length: 2, winning: true },
    });
    expect(sessionRuns([100, 0]).current).toEqual({ length: 0, winning: false });
    expect(sessionRuns([])).toEqual({
      sessions: 0,
      wins: 0,
      longestWinningRun: 0,
      current: { length: 0, winning: false },
    });
  });

  it.prop(
    "keeps every count within the sessions played",
    [Schema.Array(Schema.Int.check(Schema.isBetween({ minimum: -3, maximum: 3 })))],
    ([nets]) => {
      const runs = sessionRuns(nets);
      expect(runs.sessions).toBe(nets.length);
      expect(runs.wins).toBe(nets.filter((net) => net > 0).length);
      expect(runs.longestWinningRun).toBeLessThanOrEqual(runs.wins);
      expect(runs.current.length).toBeLessThanOrEqual(runs.sessions);
      if (runs.current.winning)
        expect(runs.longestWinningRun).toBeGreaterThanOrEqual(runs.current.length);
      const tail = nets.slice(nets.length - runs.current.length);
      expect(tail.every((net) => Math.sign(net) === (runs.current.winning ? 1 : -1))).toBe(true);
    },
  );
});
