import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import { CurrencyCode, SessionId, VenueId } from "@stacks/contracts";

import { awardLine, boardMoney, localClock } from "./trip.ts";

const usd = CurrencyCode.make("USD");
const local = (day: number, hour: number) =>
  DateTime.makeUnsafe(new Date(2026, 9, day, hour).getTime());

it("counts the small hours toward the night before", () => {
  expect(localClock.night(local(23, 22))).toBe("2026-10-23");
  expect(localClock.night(local(24, 3))).toBe("2026-10-23");
  expect(localClock.night(local(24, 7))).toBe("2026-10-24");
  expect(localClock.hour(local(24, 3))).toBe(3);
});

it("shows board money signed, without cents when there are none", () => {
  expect(boardMoney(4115000, usd)).toBe("+$41,150");
  expect(boardMoney(-48050, usd)).toBe("-$480.50");
  expect(boardMoney(100000, usd, false)).toBe("$1,000");
});

it("says what earned each award", () => {
  const session = {
    session: {
      id: SessionId.make("0192e7a0-0000-7000-8000-000000000001"),
      startedAt: local(24, 2),
    },
    venue: { id: VenueId.make("0192e7a0-0000-7000-8000-000000000002"), name: "Circa" },
    results: [],
  };
  const award = { playerId: undefined as never, session };
  expect(awardLine({ ...award, key: "biggest_hit", value: 790000 }, usd)).toBe("+$7,900 at Circa");
  expect(awardLine({ ...award, key: "rough_night", value: 50000 }, usd)).toBe("-$500 at Circa");
  expect(awardLine({ ...award, key: "heater", value: 8, session: null }, usd)).toBe(
    "8 winning sessions in a row",
  );
  expect(awardLine({ ...award, key: "night_owl", value: 2 }, usd)).toMatch(/^Sat down at 2:00/);
});
