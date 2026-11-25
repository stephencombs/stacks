import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { barTrack, lineScale, runningLine } from "./chart.ts";

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

  it("compresses lengths so a small amount still shows beside a huge one", () => {
    const linear = barTrack([18500, 60, -6000]);
    const compressed = barTrack([18500, 60, -6000], { compress: true });
    expect(linear.extent(60)).toBeLessThan(0.003);
    expect(compressed.extent(60)).toBeCloseTo(Math.sqrt(60) / (Math.sqrt(18500) + Math.sqrt(6000)));
    expect(compressed.extent(18500)).toBeGreaterThan(compressed.extent(6000));
    expect(compressed.extent(6000)).toBeGreaterThan(compressed.extent(60));
  });

  it("holds a non-zero bar at its minimum without leaving its side", () => {
    const track = barTrack([10000, 1, -1], { minimum: 0.05 });
    expect(track.extent(1)).toBe(0.05);
    expect(track.extent(-1)).toBe(track.zero);
    expect(track.extent(0)).toBe(0);
  });

  it.prop(
    "keeps every bar inside the track, in order of size",
    [
      Schema.NonEmptyArray(Schema.Int.check(Schema.isBetween({ minimum: -1e10, maximum: 1e10 }))),
      Schema.Boolean,
    ],
    ([values, compress]) => {
      const track = barTrack(values, { compress });
      const sorted = values.map(Math.abs).toSorted((a, b) => a - b);

      for (let i = 1; i < sorted.length; i++)
        expect(track.extent(sorted[i]!) + 1e-12).toBeGreaterThanOrEqual(
          track.extent(sorted[i - 1]!),
        );

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

describe("runningLine", () => {
  const size = { width: 108, height: 58 };
  const pad = { x: 4, y: 4 };

  it("places points by time and starts from break-even", () => {
    const plot = runningLine(
      [
        { at: 0, total: -100 },
        { at: 10, total: 200 },
        { at: 40, total: 100 },
      ],
      size,
      pad,
    );

    expect(plot.points.map((p) => p.x)).toEqual([4, 29, 104]);
    expect(plot.points[1]!.y).toBe(4);
    expect(plot.points[0]!.y).toBe(54);
    expect(plot.zero).toBeCloseTo(4 + (200 / 300) * 50);
    expect(plot.line.startsWith(`4,${plot.zero} 4,54`)).toBe(true);
    expect(plot.area.endsWith(`L104 ${plot.zero} Z`)).toBe(true);
  });

  it("reads the nearest point to a drag", () => {
    const plot = runningLine(
      [
        { at: 0, total: 1 },
        { at: 10, total: 2 },
        { at: 40, total: 3 },
      ],
      size,
      pad,
    );

    expect(plot.nearest(-50)).toBe(0);
    expect(plot.nearest(20)).toBe(1);
    expect(plot.nearest(70)).toBe(2);
    expect(plot.nearest(500)).toBe(2);
  });

  it("spreads points that share one time, and draws a lone point at the start", () => {
    expect(
      runningLine(
        [
          { at: 5, total: 1 },
          { at: 5, total: 2 },
        ],
        size,
        pad,
      ).points.map((p) => p.x),
    ).toEqual([4, 104]);
    expect(runningLine([{ at: 5, total: -3 }], size, pad).points).toEqual([{ x: 4, y: 54 }]);
  });

  it.prop(
    "keeps every point and break-even inside the plot",
    [
      Schema.NonEmptyArray(
        Schema.Struct({
          at: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1e12 })),
          total: Schema.Int.check(Schema.isBetween({ minimum: -1e10, maximum: 1e10 })),
        }),
      ),
    ],
    ([points]) => {
      const sorted = points.toSorted((a, b) => a.at - b.at);
      const plot = runningLine(sorted, size, pad);

      for (const { x, y } of [...plot.points, { x: 4, y: plot.zero }]) {
        expect(x).toBeGreaterThanOrEqual(4 - 1e-9);
        expect(x).toBeLessThanOrEqual(104 + 1e-9);
        expect(y).toBeGreaterThanOrEqual(4 - 1e-9);
        expect(y).toBeLessThanOrEqual(54 + 1e-9);
      }
    },
  );
});
