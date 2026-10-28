import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { fromTop, netScale } from "./chart.ts";

describe("netScale", () => {
  it("rounds to friendly steps and keeps zero in view", () => {
    expect(netScale([5000, 17000, 12000])).toEqual({
      min: 0,
      max: 20000,
      ticks: [0, 5000, 10000, 15000, 20000],
    });
    expect(netScale([-3000, 4500])).toEqual({
      min: -4000,
      max: 6000,
      ticks: [-4000, -2000, 0, 2000, 4000, 6000],
    });
  });

  it("still draws an axis when every total is zero", () => {
    expect(netScale([0, 0])).toEqual({ min: 0, max: 100, ticks: [0, 50, 100] });
  });

  it.prop(
    "covers every value and zero with evenly spaced integer ticks",
    [Schema.Array(Schema.Int.check(Schema.isBetween({ minimum: -1e10, maximum: 1e10 })))],
    ([values]) => {
      const scale = netScale(values);
      expect(scale.ticks[0]).toBe(scale.min);
      expect(scale.ticks.at(-1)).toBe(scale.max);
      expect(scale.ticks).toContain(0);
      for (const value of values) {
        expect(fromTop(value, scale)).toBeGreaterThanOrEqual(0);
        expect(fromTop(value, scale)).toBeLessThanOrEqual(1);
      }
      const steps = new Set(scale.ticks.slice(1).map((tick, i) => tick - scale.ticks[i]!));
      expect(steps.size).toBe(1);
      expect(scale.ticks.every(Number.isInteger)).toBe(true);
      expect(scale.ticks.length).toBeLessThanOrEqual(8);
    },
  );
});
