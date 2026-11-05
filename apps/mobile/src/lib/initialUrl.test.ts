import { afterEach, expect, it, vi } from "vite-plus/test";

import { getInitialURL } from "./initialUrl";

afterEach(() => vi.useRealTimers());

it("keeps a resolved launch link and clears its deadline", async () => {
  vi.useFakeTimers();
  const stalled = vi.fn();
  const failed = vi.fn();
  await expect(
    getInitialURL(() => Promise.resolve("stacks://join/invite"), stalled, failed),
  ).resolves.toBe("stacks://join/invite");
  expect(vi.getTimerCount()).toBe(0);
  expect(stalled).not.toHaveBeenCalled();
});

it("opens the default route when native link resolution never finishes", async () => {
  vi.useFakeTimers();
  const stalled = vi.fn();
  const result = getInitialURL(() => new Promise<string | null>(() => {}), stalled, vi.fn());
  await vi.advanceTimersByTimeAsync(1_500);
  await expect(result).resolves.toBeNull();
  expect(stalled).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("reports a failed link lookup and still opens the default route", async () => {
  vi.useFakeTimers();
  const failure = new Error("Native linking failed");
  const failed = vi.fn();
  await expect(getInitialURL(() => Promise.reject(failure), vi.fn(), failed)).resolves.toBeNull();
  expect(failed).toHaveBeenCalledWith(failure);
  expect(vi.getTimerCount()).toBe(0);
});

it("consumes a late rejection after the deadline", async () => {
  vi.useFakeTimers();
  let reject!: (error: Error) => void;
  const failed = vi.fn();
  const result = getInitialURL(
    () =>
      new Promise<string | null>((_resolve, fail) => {
        reject = fail;
      }),
    vi.fn(),
    failed,
  );
  await vi.advanceTimersByTimeAsync(1_500);
  await expect(result).resolves.toBeNull();
  reject(new Error("Late native failure"));
  await Promise.resolve();
  expect(failed).toHaveBeenCalledOnce();
});
