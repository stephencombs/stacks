import { expect, it } from "vite-plus/test";
import { duration, easing } from "./motion";

it("exits faster than it enters", () => {
  expect(duration.menuOut).toBeLessThan(duration.menuIn);
  expect(duration.sheetOut).toBeLessThan(duration.sheetIn);
  expect(duration.toastOut).toBeLessThan(duration.toastIn);
});

it.each(Object.entries(easing))("eases %s along a curve both clients can draw", (_, points) => {
  // A cubic-bezier's x control points must stay in [0, 1], or CSS and React Native reject it.
  const [x1, , x2] = points;
  for (const x of [x1, x2]) {
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(1);
  }
});
