import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { barTrack } from "./chart.ts";

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
