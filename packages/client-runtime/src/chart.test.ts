import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { barTrack, lineScale } from "./chart.ts";

describe("barTrack", () => {
  it("puts zero where the losses end and scales bars to the full range", () => {
    const track = barTrack([-2500, 7500, 1000]);
    expect(track.zero).toBe(0.25);
    expect(track.extent(7500)).toBe(0.75);
    expect(track.extent(-2500)).toBe(0.25);
  });

  it("starts at the left edge when nobody lost, and survives all zeros", () => {
    expect(barTrack([4000, 1000]).zero).toBe(0);
    expect(barTrack([0, 0])).toMatchObject({ zero: 0 });
    expect(barTrack([0]).extent(0)).toBe(0);
  });

  it.prop(
    "keeps every bar inside the track",
    [Schema.NonEmptyArray(Schema.Int.check(Schema.isBetween({ minimum: -1e10, maximum: 1e10 })))],
    ([values]) => {
      const track = barTrack(values);
      for (const value of values) {
        const end =
          value >= 0 ? track.zero + track.extent(value) : track.zero - track.extent(value);
        expect(end).toBeGreaterThanOrEqual(-1e-9);
        expect(end).toBeLessThanOrEqual(1 + 1e-9);
      }
    },
  );
});

describe("lineScale", () => {
  const size = { width: 300, height: 100 };

  it("puts the highest total at the top, the lowest at the bottom and spreads points evenly", () => {
    const plot = lineScale([[0, -100, 300]], size);
    expect(plot.y(300)).toBe(0);
    expect(plot.y(-100)).toBe(100);
    expect(plot.zero).toBe(75);
    expect(plot.points([0, -100, 300])).toBe("0,75 150,100 300,0");
  });

  it("keeps break-even in range when every total is up, and survives a flat or lone line", () => {
    expect(lineScale([[0, 50, 200]], size).zero).toBe(100);
    expect(lineScale([[0, 0]], size).zero).toBe(0);
    expect(lineScale([[120]], size).x(0)).toBe(0);
  });

  it("insets the plot by its padding", () => {
    const plot = lineScale([[0, 100]], size, { x: 10, y: 5 });
    expect([plot.x(0), plot.x(1), plot.y(100), plot.y(0)]).toEqual([10, 290, 5, 95]);
  });

  it.prop(
    "keeps every point inside the plot",
    [
      Schema.NonEmptyArray(
        Schema.NonEmptyArray(Schema.Int.check(Schema.isBetween({ minimum: -1e9, maximum: 1e9 }))),
      ),
    ],
    ([series]) => {
      const plot = lineScale(series, size, { x: 4, y: 4 });
      for (const values of series)
        values.forEach((value, i) => {
          expect(plot.x(i)).toBeGreaterThanOrEqual(4);
          expect(plot.x(i)).toBeLessThanOrEqual(296 + 1e-9);
          expect(plot.y(value)).toBeGreaterThanOrEqual(4 - 1e-9);
          expect(plot.y(value)).toBeLessThanOrEqual(96 + 1e-9);
        });
    },
  );
});
