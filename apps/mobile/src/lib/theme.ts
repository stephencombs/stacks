import type { ThemeChoice } from "@stacks/client-runtime/theme";
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { Uniwind } from "uniwind";

const KEY = "stacks-theme";
const listeners = new Set<() => void>();

const read = (): ThemeChoice => {
  try {
    const saved = SecureStore.getItem(KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
};

let choice = read();
Uniwind.setTheme(choice);

export const setTheme = (next: ThemeChoice) => {
  choice = next;
  Uniwind.setTheme(next);
  try {
    SecureStore.setItem(KEY, next);
  } catch {}
  for (const listener of listeners) listener();
};

export const useTheme = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => choice,
  );
