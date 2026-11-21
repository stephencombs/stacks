import type { RecordingStorageDocument } from "@stacks/client-runtime/recordingStorage";
import { CurrencyCode, MinorUnits } from "@stacks/contracts";
import * as Option from "effect/Option";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

vi.mock("expo-crypto", () => ({ getRandomValues: crypto.getRandomValues.bind(crypto) }));

const missing = [
  [Intl.NumberFormat.prototype, "formatToParts"],
  [Array.prototype, "toSorted"],
  [Array, "fromAsync"],
  [globalThis, "structuredClone"],
  [globalThis, "Iterator"],
] as const;

const hermesLike = () => {
  const saved = missing.map(
    ([owner, key]) => [owner, key, Object.getOwnPropertyDescriptor(owner, key)] as const,
  );

  for (const [owner, key] of missing) Reflect.deleteProperty(owner, key);

  return () => {
    for (const [owner, key, descriptor] of saved)
      if (descriptor) Object.defineProperty(owner, key, descriptor);
      else Reflect.deleteProperty(owner, key);
  };
};

let restore = () => {};

beforeEach(async () => {
  vi.resetModules();
  restore = hermesLike();
  await import("./polyfills");
});

afterEach(() => restore());

it("takes away what Hermes lacks", () => {
  expect(Intl.NumberFormat.prototype.formatToParts).toBeUndefined();
  expect("fromAsync" in Array).toBe(false);
  expect("structuredClone" in globalThis).toBe(false);
  expect("Iterator" in globalThis).toBe(false);
});

it("records, reviews and formats a solo session without them", async () => {
  const { makeRecordingStore } = await import("@stacks/client-runtime/recording");
  const { recordingHome, recordingPeriods } = await import("@stacks/client-runtime/recordingView");
  const { decimalSeparator, formatMoney, parseMoney } = await import("@stacks/shared/money");
  let document: RecordingStorageDocument = { revision: 0 };

  const store = makeRecordingStore({
    load: async () => document,
    commit: async (revision, payload) => {
      document = { revision: revision + 1, payload };

      return document.revision;
    },
    subscribe: () => () => {},
    close: async () => {},
  });

  await store.ready;
  const start = store.prepare({ type: "start", buyIn: 20000 });
  await store.execute(start);

  if (!("visitId" in start)) throw new Error("Expected a visit");
  await store.execute(
    store.prepare({ type: "add", visitId: start.visitId, kind: "buy_in", amount: 10000 }),
  );
  await store.execute(store.prepare({ type: "finish", visitId: start.visitId, amount: 45000 }));
  expect(store.review(start.visitId).summary).toMatchObject({
    totals: { buyIn: 30000, cashOut: 45000 },
    finalResult: 15000,
  });
  const home = recordingHome(store.getSnapshot().state!);
  expect(home.finished).toHaveLength(1);
  expect(recordingPeriods(home, "year")).toHaveLength(1);

  const usd = CurrencyCode.make("USD");
  expect(formatMoney(MinorUnits.make(15000), usd)).toContain("150");
  expect(decimalSeparator("en-US")).toBe(".");
  expect(parseMoney("150.25", usd, { locale: "en-US" })).toEqual(Option.some(15025));
  await store.close();
});

it("draws the signed-out sample trip without them", async () => {
  const { sampleTrip } = await import("@stacks/client-runtime/sample");
  const { tripRoute } = await import("@stacks/shared/trips");
  expect(tripRoute(sampleTrip.sessions).stops).toHaveLength(3);
});
