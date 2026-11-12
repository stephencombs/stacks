import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";

import { balances } from "./balances.ts";
import { ALEX, BEA, RandomLedger, entry, money, toEntries } from "./testing/ledgerArbitrary.ts";

describe("balances", () => {
  it("makes a player owe whoever covered their buy-in", () => {
    const result = balances([
      entry({ kind: "buy_in", playerId: ALEX, amount: money(10000), counterpartyId: BEA }),
    ]);
    expect(result).toEqual(
      new Map([
        [ALEX, -10000],
        [BEA, 10000],
      ]),
    );
  });

  it("makes whoever kept a cash-out owe the player", () => {
    const result = balances([
      entry({ kind: "cash_out", playerId: ALEX, amount: money(30000), counterpartyId: BEA }),
    ]);
    expect(result).toEqual(
      new Map([
        [ALEX, 30000],
        [BEA, -30000],
      ]),
    );
  });

  it("leaves out the player's own money, adjustments and voided entries", () => {
    const result = balances([
      entry({ kind: "buy_in", playerId: ALEX, amount: money(10000) }),
      entry({ kind: "cash_out", playerId: ALEX, amount: money(20000) }),
      entry({ kind: "adjustment", playerId: ALEX, amount: money(-300) }),
      entry({
        kind: "buy_in",
        playerId: ALEX,
        amount: money(10000),
        counterpartyId: BEA,
        voidedAt: DateTime.makeUnsafe("2026-10-01T00:00:00Z"),
      }),
    ]);
    expect(result.size).toBe(0);
  });

  it.prop("always sums to zero and never lists a square player", [RandomLedger], ([ledger]) => {
    const result = balances(toEntries(ledger));
    expect(Array.from(result.values()).reduce((sum, amount) => sum + amount, 0)).toBe(0);
    expect(Array.from(result.values())).not.toContain(0);
  });
});
