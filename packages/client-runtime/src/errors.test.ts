import { expect, it } from "@effect/vitest";
import { Conflict, Forbidden, InvalidRequest } from "@stacks/contracts";

import { describeError } from "./errors.ts";

it("explains API errors in plain words", () => {
  expect(describeError(new Conflict({ reason: "players_not_cashed_out" }))).toBe(
    "Everyone who bought in needs a cash-out first. Record $0 for a bust.",
  );
  expect(describeError(new Forbidden({ reason: "admins_only" }))).toBe(
    "Only the group's admins can do that.",
  );
  expect(
    describeError(new InvalidRequest({ message: "A session can't end before it starts." })),
  ).toBe("A session can't end before it starts.");
});

it("blames the connection for anything else", () => {
  expect(describeError(new Error("fetch failed"))).toBe(
    "Couldn't reach Stacks. Check your connection and try again.",
  );
});
