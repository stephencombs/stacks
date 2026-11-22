import { expect, it } from "vite-plus/test";

import { clampedScrollOffset } from "./scrollClamp";

it("clamps back to the resting top inset when filtered content shrinks shorter than the viewport", () => {
  expect(
    clampedScrollOffset(
      { offsetY: 80, insetTop: 106, insetBottom: 83, layoutHeight: 874, scrolled: true },
      540,
    ),
  ).toBe(-106);
});

it("clamps to the new bottom when content shrinks but still overflows", () => {
  expect(
    clampedScrollOffset(
      { offsetY: 400, insetTop: 106, insetBottom: 83, layoutHeight: 874, scrolled: true },
      900,
    ),
  ).toBe(109);
});

it("returns null before the user has scrolled or when the offset is still within bounds", () => {
  expect(
    clampedScrollOffset(
      { offsetY: 80, insetTop: 106, insetBottom: 83, layoutHeight: 874, scrolled: false },
      540,
    ),
  ).toBeNull();

  expect(
    clampedScrollOffset(
      { offsetY: 50, insetTop: 106, insetBottom: 83, layoutHeight: 874, scrolled: true },
      900,
    ),
  ).toBeNull();
});
