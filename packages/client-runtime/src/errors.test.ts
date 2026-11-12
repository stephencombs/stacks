import { expect, it } from "@effect/vitest";
import { Conflict, Forbidden, InvalidRequest } from "@stacks/contracts";

import { describeError, isRetryable } from "./errors.ts";

it("explains API errors in plain words", () => {
  expect(describeError(new Conflict({ reason: "players_not_cashed_out" }))).toBe(
    "Everyone who bought in needs a cash-out first. Record $0 for a bust.",
  );
  expect(describeError(new Forbidden({ reason: "admins_only" }))).toBe(
    "Only the group's admins can do that.",
  );
  expect(describeError(new Forbidden({ reason: "not_your_player" }))).toBe(
    "That player belongs to someone else.",
  );
  expect(
    describeError(new InvalidRequest({ message: "A session can't end before it starts." })),
  ).toBe("A session can't end before it starts.");
});

it("blames the connection for anything else", () => {
  expect(describeError(new Error("fetch failed"))).toBe(
    "Couldn't reach Color Up. Check your connection and try again.",
  );
});

it("retries what the network could explain, not what the API refused", () => {
  expect(isRetryable(new Error("fetch failed"))).toBe(true);
  expect(isRetryable(new Conflict({ reason: "session_closed" }))).toBe(false);
  expect(isRetryable(new Forbidden({ reason: "not_your_entry" }))).toBe(false);
});
