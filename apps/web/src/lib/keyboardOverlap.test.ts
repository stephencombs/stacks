import { expect, it } from "vite-plus/test";

import { visualKeyboardOverlap } from "./keyboardOverlap";

it("is the gap under the visual viewport when the keyboard is open", () => {
  expect(visualKeyboardOverlap(844, 490, 0)).toBe(354);
});

it("subtracts a visual viewport that has scrolled", () => {
  expect(visualKeyboardOverlap(844, 490, 12)).toBe(342);
});

it("ignores the small shift from browser chrome", () => {
  expect(visualKeyboardOverlap(844, 800, 0)).toBe(0);
});

it("is zero when the layout viewport already shrank for the keyboard", () => {
  expect(visualKeyboardOverlap(490, 490, 0)).toBe(0);
});
