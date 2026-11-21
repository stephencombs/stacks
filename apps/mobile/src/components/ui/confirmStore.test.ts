import { expect, it, vi } from "vite-plus/test";
import {
  answerConfirmation,
  currentConfirmation,
  dismissConfirmation,
  requestConfirmation,
  subscribeConfirmation,
} from "./confirmStore";

const ask = (onConfirm: () => void | Promise<string | null>) =>
  requestConfirmation({ title: "Leave group?", message: "Sure?", label: "Leave", onConfirm });

it("holds the latest question until it is dismissed, and tells listeners", () => {
  const listener = vi.fn();
  const unsubscribe = subscribeConfirmation(listener);
  const onConfirm = vi.fn();
  expect(currentConfirmation()).toBeNull();

  ask(onConfirm);
  expect(currentConfirmation()?.confirmation.label).toBe("Leave");
  expect(listener).toHaveBeenCalledTimes(1);

  dismissConfirmation();
  expect(currentConfirmation()).toBeNull();
  expect(listener).toHaveBeenCalledTimes(2);
  expect(onConfirm).not.toHaveBeenCalled();

  unsubscribe();
  ask(onConfirm);
  expect(listener).toHaveBeenCalledTimes(2);
  dismissConfirmation();
});

it("closes at once when the action is synchronous", () => {
  const onConfirm = vi.fn();
  ask(onConfirm);
  answerConfirmation();
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(currentConfirmation()).toBeNull();
});

it("keeps the dialog open and pending while an async action runs, then closes on success", async () => {
  let finish: (error: string | null) => void = () => {};
  const onConfirm = vi.fn(() => new Promise<string | null>((resolve) => (finish = resolve)));
  ask(onConfirm);
  answerConfirmation();
  expect(currentConfirmation()).toMatchObject({ pending: true, error: null });

  answerConfirmation();
  expect(onConfirm).toHaveBeenCalledTimes(1);

  finish(null);
  await Promise.resolve();
  expect(currentConfirmation()).toBeNull();
});

it("shows why an async action failed and lets the person try again", async () => {
  const replies = ["You're offline.", null];
  let calls = 0;

  const onConfirm = () => {
    const reply = replies[calls] ?? null;
    calls += 1;

    return Promise.resolve(reply);
  };

  ask(onConfirm);
  answerConfirmation();
  await Promise.resolve();
  expect(currentConfirmation()).toMatchObject({ pending: false, error: "You're offline." });

  answerConfirmation();
  await Promise.resolve();
  expect(calls).toBe(2);
  expect(currentConfirmation()).toBeNull();
});
