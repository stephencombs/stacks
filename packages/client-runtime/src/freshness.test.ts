import { expect, it } from "@effect/vitest";
import * as AsyncResult from "effect/reactivity/AsyncResult";

import { DEDUPE_MS, STALE_MS, shouldRevalidate } from "./freshness.ts";

const at = 1_000_000;
const loaded = (age: number, waiting = false) =>
  AsyncResult.success("trip", { timestamp: at - age, waiting });

it("refetches data once it's stale, keeping what's there", () => {
  expect(shouldRevalidate(loaded(STALE_MS), at, undefined)).toBe(true);
  expect(shouldRevalidate(loaded(STALE_MS - 1), at, undefined)).toBe(false);
});

it("leaves a query alone while it's already fetching, or hasn't loaded yet", () => {
  expect(shouldRevalidate(loaded(STALE_MS * 2, true), at, undefined)).toBe(false);
  expect(shouldRevalidate(AsyncResult.initial(), at, undefined)).toBe(false);
  expect(shouldRevalidate(AsyncResult.initial(true), at, undefined)).toBe(false);
});

it("refetches once when several screens ask at the same moment", () => {
  expect(shouldRevalidate(loaded(STALE_MS), at, at - 10)).toBe(false);
  expect(shouldRevalidate(loaded(STALE_MS), at, at - DEDUPE_MS)).toBe(true);
});

it("refetches data loaded before the last ledger write, however fresh", () => {
  expect(shouldRevalidate(loaded(10), at, undefined, at - 5)).toBe(true);
  expect(shouldRevalidate(loaded(10), at, undefined, at - 20)).toBe(false);
  expect(shouldRevalidate(loaded(10), at, at - 1, at - 5)).toBe(false);
});

it("recovers failed queries on mount or wake without retrying a pending request", () => {
  expect(shouldRevalidate(AsyncResult.fail("offline"), at, undefined)).toBe(true);
  expect(shouldRevalidate(AsyncResult.fail("offline"), at, at - 10)).toBe(false);
  expect(shouldRevalidate(AsyncResult.fail("offline"), at, at - DEDUPE_MS)).toBe(true);
  expect(shouldRevalidate(AsyncResult.fail("offline", { waiting: true }), at, undefined)).toBe(
    false,
  );
});
