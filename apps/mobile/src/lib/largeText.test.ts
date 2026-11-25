import { expect, it } from "vite-plus/test";

import { isLargeText } from "./largeText";

it("keeps the default and moderately larger sizes side by side", () => {
  expect(isLargeText(1)).toBe(false);
  expect(isLargeText(1.15)).toBe(false);
});

it("stacks from the first step of accessibility sizing", () => {
  expect(isLargeText(1.3)).toBe(true);
  expect(isLargeText(2)).toBe(true);
});
