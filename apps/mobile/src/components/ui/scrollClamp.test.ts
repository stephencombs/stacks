import { expect, it } from "vite-plus/test";

import { clampedScrollOffset } from "./scrollClamp";

it("clamps back to 0 when filtered content shrinks shorter than the viewport", () => {
  expect(clampedScrollOffset({ offsetY: 180, layoutHeight: 874, scrolled: true }, 540)).toBe(0);
});

it("clamps to the new bottom when content shrinks but still overflows", () => {
  expect(clampedScrollOffset({ offsetY: 400, layoutHeight: 874, scrolled: true }, 980)).toBe(106);
});

it("returns null before the user has scrolled or when the offset is still within bounds", () => {
  expect(clampedScrollOffset({ offsetY: 180, layoutHeight: 874, scrolled: false }, 540)).toBeNull();
  expect(clampedScrollOffset({ offsetY: 50, layoutHeight: 874, scrolled: true }, 980)).toBeNull();
});
