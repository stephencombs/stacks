import { expect, it } from "@effect/vitest";

import * as DateTime from "effect/DateTime";
import {
  CurrencyCode,
  GroupId,
  MinorUnits,
  PlayerId,
  StakeId,
  UserId,
  type StakeView,
} from "@stacks/contracts";

import { playedSummary, runsLine, stakeLines, winRate } from "./format.ts";

it("sums up what the group has played", () => {
  expect(playedSummary(29, 8100)).toBe("The group has played 29 sessions over 135 hours.");
  expect(playedSummary(1, 60)).toBe("The group has played 1 session over 1 hour.");
  expect(playedSummary(2, 95)).toBe("The group has played 2 sessions over 1.6 hours.");
  // Imported sessions have no recorded length.
  expect(playedSummary(41, 0)).toBe("The group has played 41 sessions.");
});

it("sums up wins and streaks", () => {
  const runs = (wins: number, longest: number, length: number, winning: boolean) => ({
    sessions: 27,
    wins,
    longestWinningRun: longest,
    current: { length, winning },
  });
  expect(winRate(runs(16, 7, 1, true))).toEqual({ count: "Up in 16 of 27", percent: "59%" });
  expect(runsLine(runs(16, 7, 1, true))).toBe("Longest winning run: 7");
  expect(runsLine(runs(16, 8, 8, true))).toBe("Longest winning run: 8 · Now on 8 wins in a row");
  expect(runsLine(runs(3, 1, 4, false))).toBe("Longest winning run: 1 · Now on 4 losses in a row");
});

it("says how a stake stands", () => {
  const bruce = PlayerId.make("0192e7a0-0000-7000-8000-000000000001");
  const nick = PlayerId.make("0192e7a0-0000-7000-8000-000000000002");
  const names = new Map([
    [bruce, "Bruce"],
    [nick, "Nick"],
  ]);
  const at = DateTime.makeUnsafe("2026-10-21T20:00:00Z");
  const view = (fields: Partial<StakeView["stake"]>, result: number, owed: number): StakeView => ({
    stake: {
      id: StakeId.make("0192e7a0-0000-7000-8000-000000000009"),
      groupId: GroupId.make("0192e7a0-0000-7000-8000-000000000008"),
      lenderId: bruce,
      borrowerId: nick,
      amount: MinorUnits.make(100000),
      lenderShare: 50,
      startedAt: at,
      endedAt: null,
      note: null,
      createdBy: UserId.make("user_bruce"),
      createdAt: at,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
      ...fields,
    },
    result: MinorUnits.make(result),
    owed: MinorUnits.make(owed),
  });
  const usd = CurrencyCode.make("USD");

  expect(stakeLines(view({}, 40000, 120000), names, usd)).toEqual({
    title: "Bruce backed Nick $1,000.00 · 50% of winnings",
    status: "Nick is up $400.00 · owes back $1,200.00",
  });
  expect(stakeLines(view({}, 0, 100000), names, usd).status).toBe(
    "Nick is even · owes back $1,000.00",
  );
  expect(
    stakeLines(view({ voidedAt: at, voidReason: "Wrong amount" }, 0, 0), names, usd).status,
  ).toBe("Voided: Wrong amount");
  expect(stakeLines(view({ endedAt: at }, -40000, 60000), names, usd).status).toMatch(
    /^Ended .+ · Nick was down \$400\.00 · owes back \$600\.00$/,
  );
});
