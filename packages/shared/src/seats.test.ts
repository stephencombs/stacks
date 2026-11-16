import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";

import { seatsNow } from "./seats.ts";
import { ALEX, BEA, CAL } from "./testing/ledgerArbitrary.ts";

const at = (minute: number) => DateTime.makeUnsafe(Date.UTC(2026, 9, 22, 21, minute));
const sit = (playerId: typeof ALEX, seat: number | null, minute: number) => ({
  playerId,
  seat,
  occurredAt: at(minute),
});

describe("seatsNow", () => {
  it("follows each player's latest sit, move or stand", () => {
    const now = seatsNow([
      sit(ALEX, 7, 0),
      sit(BEA, 4, 1),
      sit(CAL, 1, 2),
      sit(ALEX, 6, 30),
      sit(CAL, null, 40),
    ]);
    expect([...now]).toEqual([
      [ALEX, 6],
      [BEA, 4],
    ]);
  });

  it("is empty before anyone sits", () => {
    expect(seatsNow([]).size).toBe(0);
  });
});
