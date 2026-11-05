import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { around, barTrack, labelWidth, lineScale, placeLabel, spreadLabels } from "./chart.ts";

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

  it("fits the range to the focus lines and pins a far-off line to the edge", () => {
    const plot = lineScale(
      [
        [0, 100, 275],
        [0, 70, 180],
        [0, -2000, -6000],
      ],
      size,
      { x: 0, y: 0 },
      [0, 1],
    );
    expect(plot.y(275)).toBe(0);
    expect(plot.zero).toBe(100);
    expect(plot.y(-6000)).toBe(100);
    expect([plot.clipped(-6000), plot.clipped(180), plot.clipped(9000)]).toEqual([-1, 0, 1]);
  });

  it("keeps a nearby line on the plot instead of clipping it", () => {
    const plot = lineScale(
      [
        [0, 100, 275],
        [0, -150, -200],
      ],
      size,
      { x: 0, y: 0 },
      [0],
    );
    expect(plot.clipped(-200)).toBe(0);
    expect(plot.y(-200)).toBe(100);
  });

  it.prop(
    "keeps every point inside the plot, focused or not",
    [
      Schema.NonEmptyArray(
        Schema.NonEmptyArray(Schema.Int.check(Schema.isBetween({ minimum: -1e9, maximum: 1e9 }))),
      ),
      Schema.Boolean,
    ],
    ([series, focused]) => {
      const plot = lineScale(series, size, { x: 4, y: 4 }, focused ? [0] : undefined);
      for (const values of series)
        values.forEach((value, i) => {
          expect(plot.x(i)).toBeGreaterThanOrEqual(4);
          expect(plot.x(i)).toBeLessThanOrEqual(296 + 1e-9);
          expect(plot.y(value)).toBeGreaterThanOrEqual(4 - 1e-9);
          expect(plot.y(value)).toBeLessThanOrEqual(96 + 1e-9);
        });
      if (!focused)
        for (const values of series)
          for (const value of values) expect(plot.clipped(value)).toBe(0);
    },
  );
});

it("focuses a race on a player and their neighbours on the board", () => {
  expect(around(0, 3)).toEqual([0, 1]);
  expect(around(2, 4)).toEqual([1, 2, 3]);
  expect(around(0, 1)).toEqual([0]);
});

describe("spreadLabels", () => {
  it("pushes labels on the same spot apart and keeps them in bounds", () => {
    expect(spreadLabels([100, 100, 20], 14, { min: 0, max: 110 })).toEqual([96, 110, 20]);
  });

  it("shrinks the gap instead of running a crowded label off the edge", () => {
    const out = spreadLabels([0, 0, 0, 0], 14, { min: 0, max: 20 });
    const sorted = out.toSorted((a, b) => a - b);
    expect(sorted[0]).toBe(0);
    expect(sorted.at(-1)).toBe(20);
    for (let k = 1; k < sorted.length; k++) expect(sorted[k]! - sorted[k - 1]!).toBeCloseTo(20 / 3);
  });

  it.prop(
    "keeps order and spacing when there's room",
    [
      Schema.Array(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 200 }))).check(
        Schema.isMaxLength(8),
      ),
    ],
    ([ys]) => {
      const out = spreadLabels(ys, 12, { min: 0, max: 200 });
      const pairs = ys.map((y, i) => [y, out[i]!] as const).toSorted((a, b) => a[1] - b[1]);
      for (let k = 1; k < pairs.length; k++) {
        expect(pairs[k]![1] - pairs[k - 1]![1]).toBeGreaterThanOrEqual(12 - 1e-9);
        expect(pairs[k]![0]).toBeGreaterThanOrEqual(pairs[k - 1]![0]);
      }
      for (const y of out) {
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(200);
      }
    },
  );
});

describe("placeLabel", () => {
  const bounds = { min: 8, max: 390 };

  it("pins a date that starts on the left edge so its first character stays inside", () => {
    const width = labelWidth("Vegas 2026", 11);
    expect(width).toBeGreaterThan(60);
    expect(placeLabel(23, width, bounds)).toEqual({ x: 8, anchor: "start" });
  });

  it("leaves a label that already fits centered on its point", () => {
    expect(placeLabel(200, 40, bounds)).toEqual({ x: 200, anchor: "middle" });
  });

  it("pins a label that runs off the right to the end", () => {
    expect(placeLabel(380, 40, bounds)).toEqual({ x: 390, anchor: "end" });
  });
});
