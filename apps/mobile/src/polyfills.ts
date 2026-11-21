import { getRandomValues } from "expo-crypto";

if (typeof globalThis.crypto === "undefined") {
  Object.defineProperty(globalThis, "crypto", {
    value: { getRandomValues },
    configurable: true,
    writable: true,
  });
} else if (globalThis.crypto.getRandomValues == null) {
  // SAFETY: expo-crypto implements the Web Crypto getRandomValues method this process calls.
  globalThis.crypto.getRandomValues = getRandomValues as Crypto["getRandomValues"];
}

if (!Array.prototype.toSorted)
  // oxlint-disable-next-line no-extend-native -- a standard method Hermes is missing, not a new one.
  Object.defineProperty(Array.prototype, "toSorted", {
    value<T>(this: ReadonlyArray<T>, compare?: (a: T, b: T) => number) {
      return [...this].sort(compare);
    },
    writable: true,
    configurable: true,
  });
