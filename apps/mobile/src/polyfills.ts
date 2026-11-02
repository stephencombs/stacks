import { getRandomValues } from "expo-crypto";

// What Hermes lacks that the app's code and its libraries call. Imported before anything else,
// since imports run before the importing module's own body.

// Hermes has no Web Crypto; IDs are minted on the device (see @stacks/client-runtime/ids).
globalThis.crypto ??= {} as Crypto;
globalThis.crypto.getRandomValues ??= getRandomValues as Crypto["getRandomValues"];

if (!Array.prototype.toSorted)
  // oxlint-disable-next-line no-extend-native -- a standard method Hermes is missing, not a new one.
  Object.defineProperty(Array.prototype, "toSorted", {
    value<T>(this: ReadonlyArray<T>, compare?: (a: T, b: T) => number) {
      return [...this].sort(compare);
    },
    writable: true,
    configurable: true,
  });
