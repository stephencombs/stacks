import { describe, expect, it } from "@effect/vitest";
import type { MinorUnits, PlayerId } from "@stacks/contracts";

import { balances } from "./balances.ts";
import { leftToSettle, settleUp } from "./settleUp.ts";
import { ALEX, BEA, CAL, DEE, RandomLedger, money, toEntries } from "./testing/ledgerArbitrary.ts";

describe("settleUp", () => {
  it("has the largest debtor pay the largest creditor first", () => {
    const transfers = settleUp(
      new Map<PlayerId, MinorUnits>([
        [ALEX, money(-7000)],
        [BEA, money(-3000)],
        [CAL, money(6000)],
        [DEE, money(4000)],
      ]),
    );
    expect(transfers).toEqual([
      { from: ALEX, to: CAL, amount: 6000 },
      { from: ALEX, to: DEE, amount: 1000 },
      { from: BEA, to: DEE, amount: 3000 },
    ]);
    expect(leftToSettle(transfers)).toBe(10000);
  });

  it("needs no transfers when everyone is square", () => {
    expect(settleUp(new Map())).toEqual([]);
    expect(leftToSettle([])).toBe(0);
  });

  it("refuses balances that don't add up", () => {
    expect(() =>
      settleUp(
        new Map([
          [ALEX, money(-100)],
          [BEA, money(99)],
        ]),
      ),
    ).toThrow("Balances must sum to zero, got -1");
  });

  it.prop("clears every balance in at most n - 1 transfers", [RandomLedger], ([ledger]) => {
    const owed = balances(toEntries(ledger));
    const transfers = settleUp(owed);

    const remaining = new Map<PlayerId, number>(owed);
    for (const { from, to, amount } of transfers) {
      expect(amount).toBeGreaterThan(0);
      expect(from).not.toBe(to);
      remaining.set(from, (remaining.get(from) ?? 0) + amount);
      remaining.set(to, (remaining.get(to) ?? 0) - amount);
    }
    expect(Array.from(remaining.values()).every((amount) => amount === 0)).toBe(true);
    expect(transfers.length).toBeLessThanOrEqual(Math.max(owed.size - 1, 0));
    const totalCredited = Array.from(owed.values())
      .filter((amount) => amount > 0)
      .reduce((sum, amount) => sum + amount, 0);
    expect(leftToSettle(transfers)).toBe(totalCredited);
  });

  it.prop("doesn't depend on the order balances arrive in", [RandomLedger], ([ledger]) => {
    const owed = balances(toEntries(ledger));
    expect(settleUp(new Map(Array.from(owed).toReversed()))).toEqual(settleUp(owed));
  });
});
