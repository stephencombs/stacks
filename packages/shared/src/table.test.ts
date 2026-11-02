import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";

import { buyInPresets } from "./table.ts";
import { ALEX, BEA, entry, money } from "./testing/ledgerArbitrary.ts";

describe("buyInPresets", () => {
  it("offers their last buy-in, the table's usual, then double their last", () => {
    const entries = [
      entry({ kind: "buy_in", playerId: BEA, amount: money(20000) }),
      entry({ kind: "buy_in", playerId: BEA, amount: money(20000) }),
      entry({ kind: "buy_in", playerId: ALEX, amount: money(10000) }),
    ];
    expect(buyInPresets(entries, ALEX)).toEqual([10000, 20000]);
    expect(buyInPresets(entries, BEA)).toEqual([20000, 40000]);
  });

  it("offers the table's usual to someone who hasn't bought in, and nothing at an empty table", () => {
    const entries = [entry({ kind: "buy_in", playerId: BEA, amount: money(50000) })];
    expect(buyInPresets(entries, ALEX)).toEqual([50000]);
    expect(buyInPresets([], ALEX)).toEqual([]);
  });

  it("ignores voided buy-ins and cash-outs", () => {
    const entries = [
      entry({ kind: "buy_in", playerId: ALEX, amount: money(10000) }),
      entry({
        kind: "buy_in",
        playerId: ALEX,
        amount: money(90000),
        voidedAt: DateTime.makeUnsafe(0),
      }),
      entry({ kind: "cash_out", playerId: ALEX, amount: money(30000) }),
    ];
    expect(buyInPresets(entries, ALEX)).toEqual([10000, 20000]);
  });
});
