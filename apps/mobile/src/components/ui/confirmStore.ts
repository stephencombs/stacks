import { useSyncExternalStore } from "react";

export type Confirmation = {
  readonly title: string;
  readonly message: string;
  readonly label: string;
  readonly onConfirm: () => void;
};

let current: Confirmation | null = null;
const listeners = new Set<() => void>();

const set = (next: Confirmation | null) => {
  current = next;
  for (const listener of listeners) listener();
};

export const requestConfirmation = (confirmation: Confirmation) => set(confirmation);
export const dismissConfirmation = () => set(null);
export const currentConfirmation = () => current;
export const subscribeConfirmation = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export const useConfirmation = () =>
  useSyncExternalStore(subscribeConfirmation, currentConfirmation);
