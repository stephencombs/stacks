import { CachedVenue } from "@stacks/client-runtime/recording";
import { Game, type CurrencyCode, type MinorUnits } from "@stacks/contracts";
import { formatMoney } from "@stacks/shared/money";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { useSyncExternalStore } from "react";

const loadSecureStore = () => {
  if (typeof process !== "undefined" && process.env?.VITEST) return null;

  try {
    // SAFETY: this specifier is the installed expo-secure-store module; tests return before requiring it.
    return require("expo-secure-store") as typeof import("expo-secure-store");
  } catch {
    return null;
  }
};

const KEYS = {
  showCents: "stacks-pref-show-cents",
  privacyMode: "stacks-pref-privacy-mode",
  defaultGame: "stacks-pref-default-game",
  defaultVenue: "stacks-pref-default-venue",
} as const;

export const HIDDEN_AMOUNT = "••••";
export const HIDDEN_AMOUNT_LABEL = "Amount hidden";

export type DevicePreferences = {
  readonly showCents: boolean;
  readonly privacyMode: boolean;
  readonly defaultGame: Game | null;
  readonly defaultVenue: CachedVenue | null;
};

export interface PreferencesStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly deleteItem?: (key: string) => Promise<void> | void;
}

const secureStore = loadSecureStore();

const secureStorage: PreferencesStorage = {
  getItem: (key) => {
    try {
      return secureStore?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      secureStore?.setItem(key, value);
    } catch {}
  },
  deleteItem: async (key) => {
    try {
      await secureStore?.deleteItemAsync(key);
    } catch {}
  },
};

const VenueJson = Schema.toCodecJson(CachedVenue);
const decodeVenue = Schema.decodeUnknownOption(VenueJson);
const encodeVenue = Schema.encodeSync(VenueJson);

const isGame = (raw: string): raw is Game => Game.literals.some((game) => game === raw);

const parseGame = (raw: string | null) => (raw !== null && isGame(raw) ? raw : null);

const parseVenue = (raw: string | null) => {
  if (!raw) return null;

  try {
    return Option.getOrNull(decodeVenue(JSON.parse(raw)));
  } catch {
    return null;
  }
};

export const formatDisplayMoney = (
  amount: MinorUnits,
  currency: CurrencyCode,
  prefs: Pick<DevicePreferences, "showCents" | "privacyMode">,
  options: {
    readonly signDisplay?: "auto" | "always" | "exceptZero";
    readonly forAccessibility?: boolean;
  } = {},
) => {
  if (prefs.privacyMode) {
    return options.forAccessibility ? HIDDEN_AMOUNT_LABEL : HIDDEN_AMOUNT;
  }

  return formatMoney(amount, currency, {
    signDisplay: options.signDisplay ?? "auto",
    trailingZeroDisplay: prefs.showCents ? "auto" : "stripIfInteger",
  });
};

export const createPreferencesStore = (storage: PreferencesStorage) => {
  const listeners = new Set<() => void>();

  let current: DevicePreferences = {
    showCents: storage.getItem(KEYS.showCents) === "true",
    privacyMode: storage.getItem(KEYS.privacyMode) === "true",
    defaultGame: parseGame(storage.getItem(KEYS.defaultGame)),
    defaultVenue: parseVenue(storage.getItem(KEYS.defaultVenue)),
  };

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const writeOrClear = (key: string, value: string | null) => {
    if (value === null) {
      if (storage.deleteItem) void Promise.resolve(storage.deleteItem(key)).catch(() => undefined);
      else storage.setItem(key, "");

      return;
    }

    storage.setItem(key, value);
  };

  return {
    get: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    setShowCents: (showCents: boolean) => {
      if (current.showCents === showCents) return;
      current = { ...current, showCents };
      storage.setItem(KEYS.showCents, showCents ? "true" : "false");
      emit();
    },
    setPrivacyMode: (privacyMode: boolean) => {
      if (current.privacyMode === privacyMode) return;
      current = { ...current, privacyMode };
      storage.setItem(KEYS.privacyMode, privacyMode ? "true" : "false");
      emit();
    },
    setDefaultGame: (defaultGame: Game | null) => {
      if (current.defaultGame === defaultGame) return;
      current = { ...current, defaultGame };
      writeOrClear(KEYS.defaultGame, defaultGame);
      emit();
    },
    setDefaultVenue: (defaultVenue: CachedVenue | null) => {
      current = { ...current, defaultVenue };
      writeOrClear(
        KEYS.defaultVenue,
        defaultVenue ? JSON.stringify(encodeVenue(defaultVenue)) : null,
      );
      emit();
    },
  };
};

const store = createPreferencesStore(secureStorage);

export const setShowCents = (showCents: boolean) => store.setShowCents(showCents);
export const setPrivacyMode = (privacyMode: boolean) => store.setPrivacyMode(privacyMode);
export const setDefaultGame = (defaultGame: Game | null) => store.setDefaultGame(defaultGame);

export const setDefaultVenue = (defaultVenue: CachedVenue | null) =>
  store.setDefaultVenue(defaultVenue);

export const usePreferences = () => useSyncExternalStore(store.subscribe, store.get);
