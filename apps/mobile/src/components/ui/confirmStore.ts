import { useSyncExternalStore } from "react";

export type Confirmation = {
  readonly title: string;
  readonly message: string;
  readonly label: string;
  readonly dismissLabel?: string;
  readonly icon?: "trash";
  /**
   * Return a promise to keep the dialog open while the action runs: it closes when the promise
   * resolves to null, and shows the sentence it resolves to when the action failed.
   */
  readonly onConfirm: () => void | Promise<string | null>;
};

type Asking = {
  readonly confirmation: Confirmation;
  readonly pending: boolean;
  readonly error: string | null;
};

let current: Asking | null = null;
const listeners = new Set<() => void>();

const set = (next: Asking | null) => {
  current = next;
  for (const listener of listeners) listener();
};

export const requestConfirmation = (confirmation: Confirmation) =>
  set({ confirmation, pending: false, error: null });
export const dismissConfirmation = () => set(null);

/** The person confirmed. A synchronous action closes the dialog; an async one keeps it open. */
export const answerConfirmation = () => {
  const asking = current;
  if (!asking || asking.pending) return;
  const result = asking.confirmation.onConfirm();
  if (!(result instanceof Promise)) {
    // The action may have asked something else.
    if (current === asking) set(null);
    return;
  }
  set({ ...asking, pending: true, error: null });
  void result.then((error) => {
    if (current?.confirmation !== asking.confirmation) return;
    set(error === null ? null : { ...asking, pending: false, error });
  });
};

export const currentConfirmation = () => current;
export const subscribeConfirmation = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export const useConfirmation = () =>
  useSyncExternalStore(subscribeConfirmation, currentConfirmation);
