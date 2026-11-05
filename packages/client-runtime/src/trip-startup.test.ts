import { afterEach, expect, it, vi } from "vite-plus/test";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("loads trip formatting and formats ranks without Intl.PluralRules", async () => {
  vi.stubGlobal(
    "Intl",
    new Proxy(Intl, {
      get(target, key, receiver) {
        return key === "PluralRules" ? undefined : Reflect.get(target, key, receiver);
      },
    }),
  );
  const { ordinal } = await import("./trip");
  expect(
    [0, 1, 2, 3, 4, 10, 11, 12, 13, 14, 21, 22, 23, 101, 111, 112, 113, 121].map(ordinal),
  ).toEqual([
    "0th",
    "1st",
    "2nd",
    "3rd",
    "4th",
    "10th",
    "11th",
    "12th",
    "13th",
    "14th",
    "21st",
    "22nd",
    "23rd",
    "101st",
    "111th",
    "112th",
    "113th",
    "121st",
  ]);
});
