import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";
import { EntryId, SessionId, StakeId, TripId } from "@stacks/contracts";

import { balanceBreakdown, balances } from "./balances.ts";
import { stakeOutcomes, withStakes } from "./stakes.ts";
import {
  ALEX,
  BEA,
  CAL,
  DEE,
  RandomLedger,
  entry,
  money,
  toEntries,
} from "./testing/ledgerArbitrary.ts";

const players = [ALEX, BEA, CAL, DEE];
const at = DateTime.makeUnsafe("2026-10-22T20:00:00Z");
const tripId = TripId.make("0192e7a0-0000-7000-8000-000000000501");
const sessionId = SessionId.make("0192e7a0-0000-7000-8000-000000000201");
const fullEntries = (entries: ReturnType<typeof toEntries>) =>
  entries.map((item, index) => ({
    ...item,
    id: EntryId.make(`0192e7a0-0000-7000-8000-${String(index).padStart(12, "0")}`),
    occurredAt: at,
    sessionId: item.kind === "settlement" ? null : sessionId,
  }));

it("explains covered buy-ins, held cash-outs and payments from either side, in exact cents", () => {
  const entries = fullEntries([
    entry({ kind: "buy_in", playerId: ALEX, counterpartyId: BEA, amount: money(10001) }),
    entry({ kind: "cash_out", playerId: ALEX, counterpartyId: BEA, amount: money(5003) }),
    entry({ kind: "settlement", playerId: ALEX, counterpartyId: BEA, amount: money(1001) }),
    entry({ kind: "adjustment", playerId: ALEX, amount: money(99999) }),
    entry({ kind: "buy_in", playerId: ALEX, amount: money(99999) }),
    entry({
      kind: "buy_in",
      playerId: ALEX,
      counterpartyId: BEA,
      amount: money(99999),
      voidedAt: at,
    }),
  ]);
  const alex = balanceBreakdown(entries, [], new Map(), ALEX);
  expect(alex.total).toBe(-3997);
  expect(
    alex.lines.map(({ kind, amount, counterpartyId }) => ({ kind, amount, counterpartyId })),
  ).toEqual([
    { kind: "covered_buy_in", amount: -10001, counterpartyId: BEA },
    { kind: "held_cash_out", amount: 5003, counterpartyId: BEA },
    { kind: "settlement", amount: 1001, counterpartyId: BEA },
  ]);
  expect(alex.lines[0]).toMatchObject({ entryId: entries[0]!.id, sessionId, occurredAt: at });
  const bea = balanceBreakdown(entries, [], new Map(), BEA);
  expect(bea.total).toBe(3997);
  expect(bea.lines.map((line) => line.amount)).toEqual([10001, -5003, -1001]);
});

const RandomStakes = Schema.Array(
  Schema.Struct({
    lender: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 })),
    offset: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3 })),
    amount: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100_000 })),
    share: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
    voided: Schema.Boolean,
  }),
);

it.prop(
  "every explanation sums to the actual balance, including concurrent stakes and voids",
  [RandomLedger, RandomStakes],
  ([ledger, generated]) => {
    const entries = fullEntries(toEntries(ledger));
    const stakes = generated.map((item, index) => ({
      id: StakeId.make(`0192e7a0-0000-7000-8000-${String(index).padStart(12, "0")}`),
      tripId,
      lenderId: players[item.lender]!,
      borrowerId: players[(item.lender + item.offset) % players.length]!,
      amount: money(item.amount),
      lenderShare: item.share,
      startedAt: at,
      endedAt: null,
      voidedAt: item.voided ? at : null,
    }));
    const outcomes = stakeOutcomes(stakes, [{ id: sessionId, tripId, startedAt: at }], entries);
    const expected = withStakes(balances(entries), stakes, outcomes);
    const allPlayers = new Set([
      ...players,
      ...expected.keys(),
      ...entries.flatMap((item) =>
        item.counterpartyId ? [item.playerId, item.counterpartyId] : [item.playerId],
      ),
    ]);
    for (const playerId of allPlayers) {
      const explanation = balanceBreakdown(entries, stakes, outcomes, playerId);
      expect(explanation.total).toBe(expected.get(playerId) ?? 0);
      expect(explanation.lines.reduce((sum, line) => sum + line.amount, 0)).toBe(explanation.total);
      for (const otherId of allPlayers) {
        if (otherId === playerId) continue;
        const other = balanceBreakdown(entries, stakes, outcomes, otherId);
        const forward = explanation.lines
          .filter((line) => line.counterpartyId === otherId)
          .reduce((sum, line) => sum + line.amount, 0);
        const reverse = other.lines
          .filter((line) => line.counterpartyId === playerId)
          .reduce((sum, line) => sum + line.amount, 0);
        expect(forward + reverse).toBe(0);
      }
    }
  },
);

it("keeps principal, result and winnings share separate from the debt", () => {
  const stake = {
    id: StakeId.make("0192e7a0-0000-7000-8000-000000000301"),
    tripId,
    lenderId: BEA,
    borrowerId: ALEX,
    amount: money(10001),
    lenderShare: 30,
    startedAt: at,
    endedAt: null,
    voidedAt: null,
  };
  const outcome = { result: money(101), owed: money(10031) };
  expect(balanceBreakdown([], [stake], new Map([[stake.id, outcome]]), ALEX)).toEqual({
    total: -10031,
    lines: [
      {
        kind: "stake",
        stakeId: stake.id,
        counterpartyId: BEA,
        amount: -10031,
        principal: 10001,
        lenderShare: 30,
        result: 101,
        occurredAt: at,
      },
    ],
  });
  expect(
    balanceBreakdown(
      [],
      [stake],
      new Map([[stake.id, { result: money(-20000), owed: money(0) }]]),
      ALEX,
    ),
  ).toEqual({ total: 0, lines: [] });
});
