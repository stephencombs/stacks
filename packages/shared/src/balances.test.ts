import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";

import { applyPayments, balances } from "./balances.ts";
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

  it("clears a debt when it's settled", () => {
    const result = balances([
      entry({ kind: "buy_in", playerId: ALEX, amount: money(10000), counterpartyId: BEA }),
      entry({ kind: "settlement", playerId: ALEX, amount: money(10000), counterpartyId: BEA }),
    ]);
    expect(result.size).toBe(0);
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

describe("applyPayments", () => {
  it("matches what the server computes once the settlement is saved", () => {
    const covered = entry({
      kind: "buy_in",
      playerId: ALEX,
      amount: money(10000),
      counterpartyId: BEA,
    });
    const before = balances([covered]);
    const paid = applyPayments(before, [{ from: ALEX, to: BEA, amount: money(4000) }]);
    const saved = balances([
      covered,
      entry({ kind: "settlement", playerId: ALEX, amount: money(4000), counterpartyId: BEA }),
    ]);
    expect(paid).toEqual(saved);
  });

  it("drops anyone a payment squares up", () => {
    const owed = new Map([
      [ALEX, money(-500)],
      [BEA, money(500)],
    ]);
    expect(applyPayments(owed, [{ from: ALEX, to: BEA, amount: money(500) }]).size).toBe(0);
  });
});
