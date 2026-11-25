import { expect, it } from "vite-plus/test";
import { duration, easing, pressScale } from "./motion";

it("exits faster than it enters", () => {
  expect(duration.menuOut).toBeLessThan(duration.menuIn);
  expect(duration.sheetOut).toBeLessThan(duration.sheetIn);
  expect(duration.toastOut).toBeLessThan(duration.toastIn);
});

it.each(Object.entries(easing))("eases %s along a curve both clients can draw", (_, points) => {
  const [x1, , x2] = points;

  for (const x of [x1, x2]) {
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(1);
  }
});

it("keeps the shared timings and press scale", () => {
  expect(duration).toEqual({
    menuIn: 200,
    menuOut: 150,
    sheetIn: 340,
    sheetOut: 240,
    roll: 220,
    toastIn: 250,
    toastOut: 160,
    pressDown: 100,
    pressUp: 150,
    pulse: 1800,
  });
  expect(pressScale).toBe(0.96);
});
