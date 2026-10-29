import type { ThemeChoice } from "@stacks/client-runtime/theme";
import { useSyncExternalStore } from "react";

// index.html reads the same key before first paint.
const KEY = "stacks-theme";
const lightQuery = matchMedia("(prefers-color-scheme: light)");
const listeners = new Set<() => void>();

const read = (): ThemeChoice => {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === "light" || saved === "system" ? saved : "dark";
  } catch {
    return "dark";
  }
};

let choice = read();

const apply = () => {
  const root = document.documentElement;
  const light = choice === "light" || (choice === "system" && lightQuery.matches);
  // Without this, every button would fade into its new color.
  root.dataset.themeSwitching = "";
  if (light) root.dataset.theme = "light";
  else delete root.dataset.theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", light ? "#f1f3f6" : "#0e1116");
  requestAnimationFrame(() => requestAnimationFrame(() => delete root.dataset.themeSwitching));
};

lightQuery.addEventListener("change", () => {
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
