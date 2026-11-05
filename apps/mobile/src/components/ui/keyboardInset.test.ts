import { expect, it } from "vite-plus/test";

import { keyboardOverlap, sheetBottomEdge } from "./keyboardInset";

it("treats a sheet measured from its own top as reaching the screen bottom", () => {
  expect(sheetBottomEdge(852, { y: 0, height: 793 })).toBe(852);
});

it("keeps a screen-space bottom when the sheet's origin is known", () => {
  expect(sheetBottomEdge(852, { y: 59, height: 793 })).toBe(852);
  expect(sheetBottomEdge(1024, { y: 80, height: 600 })).toBe(680);
});

it("covers a phone sheet by the docked keyboard height", () => {
  expect(keyboardOverlap(852, { screenY: 516, height: 336 })).toBe(336);
});

it("covers only the part of a shorter sheet the keyboard reaches", () => {
  expect(keyboardOverlap(700, { screenY: 516, height: 336 })).toBe(184);
});

it("leaves a sheet that already sits above the keyboard", () => {
  expect(keyboardOverlap(480, { screenY: 516, height: 336 })).toBe(0);
});

it("treats a keyboard with no reported origin as docked", () => {
  expect(keyboardOverlap(852, { screenY: 0, height: 280 })).toBe(280);
});

it("is zero when the keyboard is closed", () => {
  expect(keyboardOverlap(852, { screenY: 852, height: 0 })).toBe(0);
});
