import { afterEach, expect, it, vi } from "vite-plus/test";

import {
  BACKSPACE_REPEAT_DELAY_MS,
  BACKSPACE_REPEAT_INTERVAL_MS,
  holdBackspace,
} from "./holdBackspace";

afterEach(() => {
  vi.useRealTimers();
});

const field = (start: string) => {
  let amount = start;
  return {
    erase: () => {
      amount = amount.slice(0, -1);
      return amount.length === 0;
    },
    text: () => amount,
  };
};

it("waits longer than a tap, then repeats faster than that pause", () => {
  expect(BACKSPACE_REPEAT_DELAY_MS).toBeGreaterThanOrEqual(300);
  expect(BACKSPACE_REPEAT_INTERVAL_MS).toBeGreaterThanOrEqual(50);
  expect(BACKSPACE_REPEAT_INTERVAL_MS).toBeLessThan(BACKSPACE_REPEAT_DELAY_MS);
});

it("deletes one character when released before the repeat starts", () => {
  vi.useFakeTimers();
  const amount = field("5213");
  const release = holdBackspace(amount.erase);

  expect(amount.text()).toBe("521");
  expect(vi.getTimerCount()).toBe(1);

  vi.advanceTimersByTime(BACKSPACE_REPEAT_DELAY_MS - 1);
  release();
  vi.advanceTimersByTime(BACKSPACE_REPEAT_INTERVAL_MS * 5);

  expect(amount.text()).toBe("521");
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps deleting on a steady interval while held", () => {
  vi.useFakeTimers();
  const amount = field("521336");
  holdBackspace(amount.erase);

  expect(amount.text()).toBe("52133");
  vi.advanceTimersByTime(BACKSPACE_REPEAT_DELAY_MS - 1);
  expect(amount.text()).toBe("52133");

  vi.advanceTimersByTime(1);
  expect(amount.text()).toBe("5213");

  vi.advanceTimersByTime(BACKSPACE_REPEAT_INTERVAL_MS);
  expect(amount.text()).toBe("521");

  vi.advanceTimersByTime(BACKSPACE_REPEAT_INTERVAL_MS);
  expect(amount.text()).toBe("52");

  vi.advanceTimersByTime(BACKSPACE_REPEAT_INTERVAL_MS);
  expect(amount.text()).toBe("5");
});

it("stops repeating when the amount is empty", () => {
  vi.useFakeTimers();
  const amount = field("21");
  holdBackspace(amount.erase);

  expect(amount.text()).toBe("2");
  vi.advanceTimersByTime(BACKSPACE_REPEAT_DELAY_MS);
  expect(amount.text()).toBe("");
  expect(vi.getTimerCount()).toBe(0);

  vi.advanceTimersByTime(BACKSPACE_REPEAT_INTERVAL_MS * 4);
  expect(amount.text()).toBe("");
});

it("stops repeating when the key is released", () => {
  vi.useFakeTimers();
  const amount = field("521336");
  const release = holdBackspace(amount.erase);

  vi.advanceTimersByTime(BACKSPACE_REPEAT_DELAY_MS + BACKSPACE_REPEAT_INTERVAL_MS);
  const held = amount.text();
  expect(held).toBe("521");

  release();
  vi.advanceTimersByTime(BACKSPACE_REPEAT_INTERVAL_MS * 5);

  expect(amount.text()).toBe(held);
  expect(vi.getTimerCount()).toBe(0);
});

it("does not schedule a repeat when the amount is already empty", () => {
  vi.useFakeTimers();
  let calls = 0;
  const release = holdBackspace(() => {
    calls += 1;
    return true;
  });

  expect(calls).toBe(1);
  release();
  vi.advanceTimersByTime(BACKSPACE_REPEAT_DELAY_MS + BACKSPACE_REPEAT_INTERVAL_MS);
  expect(calls).toBe(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("deletes again on the next press", () => {
  vi.useFakeTimers();
  const amount = field("99");
  holdBackspace(amount.erase)();
  expect(amount.text()).toBe("9");
  expect(vi.getTimerCount()).toBe(0);

  const release = holdBackspace(amount.erase);
  expect(amount.text()).toBe("");
  release();
  expect(vi.getTimerCount()).toBe(0);
});
