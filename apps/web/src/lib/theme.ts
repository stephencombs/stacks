import type { ThemeChoice } from "@stacks/client-runtime/theme";
import { useSyncExternalStore } from "react";

// index.html reads the same key before first paint.
const KEY = "stacks-theme";
const darkQuery = matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

const read = (): ThemeChoice => {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
};

let choice = read();

const apply = () => {
  const root = document.documentElement;
  const dark = choice === "dark" || (choice === "system" && darkQuery.matches);
  // Without this, every button would fade into its new color.
  root.dataset.themeSwitching = "";
  if (dark) root.dataset.theme = "dark";
  else delete root.dataset.theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#000000" : "#f2f2f6");
  requestAnimationFrame(() => requestAnimationFrame(() => delete root.dataset.themeSwitching));
};

darkQuery.addEventListener("change", () => {
  if (choice === "system") apply();
});

export const setTheme = (next: ThemeChoice) => {
  choice = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {}
  apply();
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
