import { expect, it } from "@effect/vitest";

import { playedSummary } from "./format.ts";

it("sums up what the group has played", () => {
  expect(playedSummary(29, 8100)).toBe("The group has played 29 sessions over 135 hours.");
  expect(playedSummary(1, 60)).toBe("The group has played 1 session over 1 hour.");
  expect(playedSummary(2, 95)).toBe("The group has played 2 sessions over 1.6 hours.");
});
