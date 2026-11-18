import { expect, it } from "vite-plus/test";

import { fitsSegments } from "./segmentFit";

const phone = 412 - 64;

it("Add, Subtract and Set total are segments on a 412dp screen at 1.0×", () => {
  expect(fitsSegments(["Add", "Subtract", "Set total"], phone, 1)).toBe(true);
});

it("the same labels fall back to a dropdown at large text", () => {
  expect(fitsSegments(["Add", "Subtract", "Set total"], phone, 1.35)).toBe(false);
});

it("short labels stay segmented at large text", () => {
  expect(fitsSegments(["Me", "Sam"], phone, 1.35)).toBe(true);
});

it("a long label falls back to a dropdown at 1.0×", () => {
  expect(fitsSegments(["Add", "Subtract", "Replace the whole total"], phone, 1)).toBe(false);
});

it("a narrow screen drops to a dropdown sooner", () => {
  expect(fitsSegments(["Add", "Subtract", "Set total"], 320 - 64, 1)).toBe(false);
});

it("one option or more than three are never segments", () => {
  expect(fitsSegments(["Only"], phone, 1)).toBe(false);
  expect(fitsSegments(["A", "B", "C", "D"], phone, 1)).toBe(false);
});
