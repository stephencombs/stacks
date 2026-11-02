import type { ThemeChoice } from "@stacks/client-runtime/theme";
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { Uniwind } from "uniwind";

const KEY = "stacks-theme";
const listeners = new Set<() => void>();

// Secure store has no web build, and the browser run of the app saves to localStorage instead.
const storage = {
  get: () => (Platform.OS === "web" ? localStorage.getItem(KEY) : SecureStore.getItem(KEY)),
  set: (value: string) =>
    Platform.OS === "web" ? localStorage.setItem(KEY, value) : SecureStore.setItem(KEY, value),
};

const read = (): ThemeChoice => {
  try {
    const saved = storage.get();
    return saved === "light" || saved === "system" ? saved : "dark";
  } catch {
    return "dark";
  }
};

let choice = read();
Uniwind.setTheme(choice);

export const setTheme = (next: ThemeChoice) => {
  choice = next;
  Uniwind.setTheme(next);
  try {
    storage.set(next);
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
