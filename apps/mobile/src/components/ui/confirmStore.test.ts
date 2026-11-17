import { expect, it, vi } from "vite-plus/test";
import {
  currentConfirmation,
  dismissConfirmation,
  requestConfirmation,
  subscribeConfirmation,
} from "./confirmStore";

it("holds the latest question until it is dismissed, and tells listeners", () => {
  const listener = vi.fn();
  const unsubscribe = subscribeConfirmation(listener);
  const onConfirm = vi.fn();
  expect(currentConfirmation()).toBeNull();

  requestConfirmation({ title: "Delete session", message: "Sure?", label: "Delete", onConfirm });
  expect(currentConfirmation()?.label).toBe("Delete");
  expect(listener).toHaveBeenCalledTimes(1);

  dismissConfirmation();
  expect(currentConfirmation()).toBeNull();
  expect(listener).toHaveBeenCalledTimes(2);
  expect(onConfirm).not.toHaveBeenCalled();

  unsubscribe();
  requestConfirmation({ title: "x", message: "y", label: "z", onConfirm });
  expect(listener).toHaveBeenCalledTimes(2);
  dismissConfirmation();
});
