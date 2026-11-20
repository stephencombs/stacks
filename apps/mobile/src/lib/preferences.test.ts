import { Game, MinorUnits, CurrencyCode, VenueId } from "@stacks/contracts";
import { expect, it } from "vite-plus/test";

import {
  HIDDEN_AMOUNT,
  HIDDEN_AMOUNT_LABEL,
  createPreferencesStore,
  formatDisplayMoney,
  type PreferencesStorage,
} from "./preferences";

const usd = CurrencyCode.make("USD");

const memoryStorage = (initial: Record<string, string> = {}) => {
  const map = new Map(Object.entries(initial));
  const storage: PreferencesStorage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    deleteItem: (key) => {
      map.delete(key);
    },
  };
  return { map, storage };
};

it("starts with safe defaults and restores valid saved preferences", () => {
  const empty = createPreferencesStore(memoryStorage().storage);
  expect(empty.get()).toEqual({
    showCents: false,
    privacyMode: false,
    defaultGame: null,
    defaultVenue: null,
  });

  const { map, storage } = memoryStorage();
  const first = createPreferencesStore(storage);
  first.setShowCents(true);
  first.setPrivacyMode(true);
  first.setDefaultGame(Game.make("poker_cash"));
  const venue = {
    id: VenueId.make("0192e7a0-0000-7000-8000-000000000001"),
    name: "Bellagio",
    kind: "casino" as const,
    city: "Las Vegas",
    region: "NV",
    country: "US",
    lat: 36.1129,
    lng: -115.1765,
  };
  first.setDefaultVenue(venue);

  const second = memoryStorage(Object.fromEntries(map));
  const reloaded = createPreferencesStore(second.storage);
  expect(reloaded.get()).toEqual({
    showCents: true,
    privacyMode: true,
    defaultGame: "poker_cash",
    defaultVenue: venue,
  });

  reloaded.setDefaultGame(null);
  reloaded.setDefaultVenue(null);
  expect(second.map.has("stacks-pref-default-game")).toBe(false);
  expect(second.map.has("stacks-pref-default-venue")).toBe(false);
});

it("recovers cleanly from corrupt stored values", () => {
  const { storage } = memoryStorage({
    "stacks-pref-show-cents": "maybe",
    "stacks-pref-privacy-mode": "1",
    "stacks-pref-default-game": "unknown_game",
    "stacks-pref-default-venue": "{bad-json",
  });
  const prefs = createPreferencesStore(storage).get();
  expect(prefs).toEqual({
    showCents: false,
    privacyMode: false,
    defaultGame: null,
    defaultVenue: null,
  });
});

it("formats whole cents only when enabled and hides amounts in privacy mode", () => {
  expect(
    formatDisplayMoney(MinorUnits.make(20000), usd, { showCents: false, privacyMode: false }),
  ).toBe("$200");
  expect(
    formatDisplayMoney(MinorUnits.make(20050), usd, { showCents: false, privacyMode: false }),
  ).toBe("$200.50");
  expect(
    formatDisplayMoney(MinorUnits.make(20000), usd, { showCents: true, privacyMode: false }),
  ).toBe("$200.00");
  expect(
    formatDisplayMoney(
      MinorUnits.make(-15000),
      usd,
      { showCents: true, privacyMode: false },
      {
        signDisplay: "exceptZero",
      },
    ),
  ).toBe("-$150.00");

  expect(
    formatDisplayMoney(MinorUnits.make(20000), usd, { showCents: true, privacyMode: true }),
  ).toBe(HIDDEN_AMOUNT);
  expect(
    formatDisplayMoney(
      MinorUnits.make(20000),
      usd,
      { showCents: true, privacyMode: true },
      { forAccessibility: true },
    ),
  ).toBe(HIDDEN_AMOUNT_LABEL);
});
