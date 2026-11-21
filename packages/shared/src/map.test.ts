import { MinorUnits, TripId, VenueId, VisitId } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
import { expect, it } from "vite-plus/test";

import {
  mapCamera,
  mapDayKey,
  mapDayPath,
  mapDays,
  mapPins,
  mapTripPath,
  type MapVenue,
  type MapVisit,
} from "./map.ts";

const utc = DateTime.zoneMakeOffset(0);

const venue = (id: string, name: string, lat: number | null, lng: number | null): MapVenue => ({
  id: VenueId.make(id),
  name,
  kind: "casino",
  city: "Las Vegas",
  region: "NV",
  country: "US",
  lat,
  lng,
});

const wynn = venue("0192e7a0-0000-7000-8000-000000000001", "Wynn Las Vegas", 36.1265, -115.1656);
const bellagio = venue("0192e7a0-0000-7000-8000-000000000002", "Bellagio", 36.1129, -115.1765);
const aria = venue("0192e7a0-0000-7000-8000-000000000003", "Aria", 36.1072, -115.1766);
const noCoords = venue("0192e7a0-0000-7000-8000-000000000004", "Home Club", null, null);
const tripA = TripId.make("0192e7a0-0000-7000-8000-000000000101");

const visit = (
  n: number,
  options: {
    start: string;
    finish: string | null;
    result: number | null;
    venue: MapVenue | null;
    tripId?: TripId | null;
    deletedAt?: string;
  },
): MapVisit => ({
  visit: {
    id: VisitId.make(`0192e7a0-0000-7000-8000-00000000100${n}`),
    startedAt: DateTime.makeUnsafe(options.start),
    finishedAt: options.finish ? DateTime.makeUnsafe(options.finish) : null,
    ...(options.deletedAt ? { deletedAt: DateTime.makeUnsafe(options.deletedAt) } : {}),
  },
  totals: {
    buyIn: MinorUnits.make(20000),
    cashOut: MinorUnits.make(20000 + (options.result ?? 0)),
  },
  finalResult: options.result === null ? null : MinorUnits.make(options.result),
  table: {
    tripId: options.tripId ?? null,
  },
  venue: options.venue,
});

it("aggregates finished venue pins colored by result and counts unmapped visits", () => {
  const visits: MapVisit[] = [
    visit(1, {
      start: "2026-11-06T20:00:00Z",
      finish: "2026-11-06T22:00:00Z",
      result: 14500,
      venue: wynn,
    }),
    visit(2, {
      start: "2026-11-06T23:00:00Z",
      finish: "2026-11-07T00:00:00Z",
      result: -12000,
      venue: bellagio,
    }),
    visit(3, {
      start: "2026-11-07T01:00:00Z",
      finish: "2026-11-07T02:00:00Z",
      result: 0,
      venue: aria,
    }),
    visit(4, {
      start: "2026-11-07T03:00:00Z",
      finish: "2026-11-07T04:00:00Z",
      result: 5000,
      venue: wynn,
    }),
    // Missing venue and missing coordinates count in unmappedCount.
    visit(5, {
      start: "2026-11-07T05:00:00Z",
      finish: "2026-11-07T06:00:00Z",
      result: 2500,
      venue: null,
    }),
    visit(6, {
      start: "2026-11-07T07:00:00Z",
      finish: "2026-11-07T08:00:00Z",
      result: -1000,
      venue: noCoords,
    }),
    // Live and deleted visits are excluded.
    visit(7, { start: "2026-11-07T09:00:00Z", finish: null, result: null, venue: wynn }),
    visit(8, {
      start: "2026-11-07T09:00:00Z",
      finish: "2026-11-07T10:00:00Z",
      result: 99900,
      venue: aria,
      deletedAt: "2026-11-07T10:05:00Z",
    }),
  ];

  const mapped = mapPins(visits);
  expect(mapped.unmappedCount).toBe(2);
  expect(mapped.totalResult).toBe(9000);
  expect(mapped.pins).toHaveLength(3);

  const byId = new Map(mapped.pins.map((p) => [p.venue.id, p]));
  expect(byId.get(wynn.id)).toMatchObject({ result: 19500, sessions: 2, hours: 3, outcome: "win" });
  expect(byId.get(wynn.id)!.visits.map((v) => v.visit.id)).toEqual([
    visits[3]!.visit.id,
    visits[0]!.visit.id,
  ]);
  expect(byId.get(bellagio.id)).toMatchObject({ result: -12000, sessions: 1, outcome: "loss" });
  expect(byId.get(aria.id)).toMatchObject({ result: 0, sessions: 1, outcome: "even" });
});

it("builds chronological day and trip paths including revisits and unmapped counts", () => {
  const visits: MapVisit[] = [
    visit(1, {
      start: "2026-11-07T18:00:00Z",
      finish: "2026-11-07T19:00:00Z",
      result: 10000,
      venue: wynn,
      tripId: tripA,
    }),
    visit(2, {
      start: "2026-11-07T20:00:00Z",
      finish: "2026-11-07T21:00:00Z",
      result: -4000,
      venue: bellagio,
      tripId: tripA,
    }),
    // Consecutive play at Bellagio stays one stop; later return to Wynn becomes stop 3.
    visit(3, {
      start: "2026-11-07T21:30:00Z",
      finish: "2026-11-07T22:00:00Z",
      result: 1000,
      venue: bellagio,
      tripId: tripA,
    }),
    visit(4, {
      start: "2026-11-07T22:30:00Z",
      finish: "2026-11-07T23:30:00Z",
      result: 5000,
      venue: wynn,
      tripId: tripA,
    }),
    visit(5, {
      start: "2026-11-07T23:45:00Z",
      finish: "2026-11-08T00:15:00Z",
      result: 2000,
      venue: null,
      tripId: tripA,
    }),
  ];

  const key = mapDayKey(visits[0]!.visit.startedAt, utc);
  expect(key).toBe("2026-11-07");
  expect(mapDays(visits, utc)).toHaveLength(1);

  const day = mapDayPath(visits, key, utc);
  expect(
    day.stops.map((s) => ({ number: s.number, name: s.venue.name, result: s.result })),
  ).toEqual([
    { number: 1, name: "Wynn Las Vegas", result: 10000 },
    { number: 2, name: "Bellagio", result: -3000 },
    { number: 3, name: "Wynn Las Vegas", result: 5000 },
  ]);
  expect(day.venueCount).toBe(2);
  expect(day.sessionCount).toBe(5);
  expect(day.unmappedCount).toBe(1);
  expect(day.result).toBe(14000);
  expect(day.path).toHaveLength(3);

  const trip = mapTripPath(visits, tripA);
  expect(trip.stops).toHaveLength(3);
  expect(trip.result).toBe(14000);
});

it("frames single and multiple venues nicely", () => {
  expect(mapCamera([])).toBeNull();
  expect(mapCamera([{ lat: 36.1265, lng: -115.1656 }])).toEqual({
    coordinates: { latitude: 36.1265, longitude: -115.1656 },
    zoom: 14,
  });
  const multi = mapCamera([
    { lat: 36.1265, lng: -115.1656 },
    { lat: 36.1072, lng: -115.1766 },
  ]);
  expect(multi).not.toBeNull();
  expect(multi!.zoom).toBeGreaterThanOrEqual(3);
  expect(multi!.zoom).toBeLessThanOrEqual(16);
});
