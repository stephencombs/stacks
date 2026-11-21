import type { MinorUnits, Table, TripId, VenueId, VenueKind, Visit } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";

import { checkedMinorUnits } from "./exactMoney.ts";

export interface MapVenue {
  readonly id: VenueId;
  readonly name: string;
  readonly kind: VenueKind;
  readonly city: string | null;
  readonly region: string | null;
  readonly country: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
}

export interface MapVisit {
  readonly visit: Pick<Visit, "id" | "startedAt" | "finishedAt" | "deletedAt">;
  readonly totals: { readonly buyIn: MinorUnits; readonly cashOut: MinorUnits };
  readonly finalResult: MinorUnits | null;
  readonly table: Pick<Table, "tripId">;
  readonly venue: MapVenue | null;
}

export type PlacedMapVenue = MapVenue & { readonly lat: number; readonly lng: number };

export type MapOutcome = "win" | "loss" | "even";

export interface MapVenuePin<V extends MapVisit = MapVisit> {
  readonly venue: PlacedMapVenue;
  readonly lat: number;
  readonly lng: number;
  readonly result: MinorUnits;
  readonly sessions: number;
  readonly hours: number;
  readonly outcome: MapOutcome;
  readonly visits: ReadonlyArray<V>;
}

export interface MapPathStop<V extends MapVisit = MapVisit> {
  readonly number: number;
  readonly venue: PlacedMapVenue;
  readonly lat: number;
  readonly lng: number;
  readonly result: MinorUnits;
  readonly outcome: MapOutcome;
  readonly visits: ReadonlyArray<V>;
}

export interface MapPathSummary<V extends MapVisit = MapVisit> {
  readonly stops: ReadonlyArray<MapPathStop<V>>;
  readonly path: ReadonlyArray<{ readonly latitude: number; readonly longitude: number }>;
  readonly venueCount: number;
  readonly sessionCount: number;
  readonly unmappedCount: number;
  readonly result: MinorUnits;
  readonly startedAt: DateTime.Utc | null;
  readonly finishedAt: DateTime.Utc | null;
}

export interface MapDaySummary {
  readonly key: string;
  readonly date: DateTime.Utc;
  readonly sessions: number;
  readonly unmappedCount: number;
  readonly result: MinorUnits;
}

export interface MapCameraPosition {
  readonly coordinates: { readonly latitude: number; readonly longitude: number };
  readonly zoom: number;
}

const ms = DateTime.toEpochMillis;

const isPlacedVenue = (venue: MapVenue | null): venue is PlacedMapVenue =>
  venue !== null &&
  venue.lat !== null &&
  venue.lng !== null &&
  Number.isFinite(venue.lat) &&
  Number.isFinite(venue.lng);

const isFinishedVisit = <V extends MapVisit>(item: V): boolean =>
  item.visit.deletedAt === undefined && item.visit.finishedAt !== null && item.finalResult !== null;

const outcomeOf = (result: number): MapOutcome =>
  result > 0 ? "win" : result < 0 ? "loss" : "even";

const hoursOf = (milliseconds: bigint) => Number((milliseconds + 18_000n) / 36_000n) / 100;

const durationMs = (visit: MapVisit["visit"]) =>
  visit.finishedAt === null ? 0n : BigInt(Math.max(0, ms(visit.finishedAt) - ms(visit.startedAt)));

const compareFinishedDesc = (a: MapVisit, b: MapVisit) =>
  ms(b.visit.finishedAt!) - ms(a.visit.finishedAt!) ||
  ms(b.visit.startedAt) - ms(a.visit.startedAt) ||
  (a.visit.id < b.visit.id ? -1 : a.visit.id > b.visit.id ? 1 : 0);

const compareStartedAsc = (a: MapVisit, b: MapVisit) =>
  ms(a.visit.startedAt) - ms(b.visit.startedAt) ||
  ms(a.visit.finishedAt!) - ms(b.visit.finishedAt!) ||
  (a.visit.id < b.visit.id ? -1 : a.visit.id > b.visit.id ? 1 : 0);

/** Local YYYY-MM-DD key in the caller's time zone for a UTC timestamp. */
export const mapDayKey = (utc: DateTime.Utc, timeZone: DateTime.TimeZone): string => {
  const parts = DateTime.toParts(DateTime.setZone(utc, timeZone));
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
};

/**
 * Venue pins for all finished own sessions with cached venue coordinates, plus the count of
 * sessions lacking a saved location so none are silently dropped.
 */
export const mapPins = <V extends MapVisit>(visits: ReadonlyArray<V>) => {
  const finished = visits.filter(isFinishedVisit);
  const groups = new Map<
    VenueId,
    {
      venue: PlacedMapVenue;
      result: bigint;
      milliseconds: bigint;
      visits: Array<V>;
    }
  >();
  let unmappedCount = 0;
  let total = 0n;

  for (const item of finished) {
    const net = BigInt(item.finalResult!);
    total += net;
    if (!isPlacedVenue(item.venue)) {
      unmappedCount += 1;
      continue;
    }
    const existing = groups.get(item.venue.id);
    if (existing) {
      existing.result += net;
      existing.milliseconds += durationMs(item.visit);
      existing.visits.push(item);
    } else {
      groups.set(item.venue.id, {
        venue: item.venue,
        result: net,
        milliseconds: durationMs(item.visit),
        visits: [item],
      });
    }
  }

  const pins: ReadonlyArray<MapVenuePin<V>> = [...groups.values()]
    .map((group) => {
      const result = checkedMinorUnits(group.result);
      return {
        venue: group.venue,
        lat: group.venue.lat,
        lng: group.venue.lng,
        result,
        sessions: group.visits.length,
        hours: hoursOf(group.milliseconds),
        outcome: outcomeOf(result),
        visits: group.visits.toSorted(compareFinishedDesc),
      };
    })
    .toSorted((a, b) => compareFinishedDesc(a.visits[0]!, b.visits[0]!));

  return {
    pins,
    unmappedCount,
    totalResult: checkedMinorUnits(total),
  };
};

/** Local calendar days that have at least one finished visit, newest day first. */
export const mapDays = <V extends MapVisit>(
  visits: ReadonlyArray<V>,
  timeZone: DateTime.TimeZone,
): ReadonlyArray<MapDaySummary> => {
  const groups = new Map<
    string,
    { date: DateTime.Utc; sessions: number; unmappedCount: number; result: bigint }
  >();
  for (const item of visits) {
    if (!isFinishedVisit(item)) continue;
    const key = mapDayKey(item.visit.startedAt, timeZone);
    const existing = groups.get(key);
    const unmapped = isPlacedVenue(item.venue) ? 0 : 1;
    const net = BigInt(item.finalResult!);
    if (existing) {
      existing.sessions += 1;
      existing.unmappedCount += unmapped;
      existing.result += net;
    } else {
      groups.set(key, {
        date: item.visit.startedAt,
        sessions: 1,
        unmappedCount: unmapped,
        result: net,
      });
    }
  }
  return [...groups]
    .toSorted(([a], [b]) => b.localeCompare(a))
    .map(([key, group]) => ({
      key,
      date: group.date,
      sessions: group.sessions,
      unmappedCount: group.unmappedCount,
      result: checkedMinorUnits(group.result),
    }));
};

const buildPath = <V extends MapVisit>(visits: ReadonlyArray<V>): MapPathSummary<V> => {
  const ordered = visits.filter(isFinishedVisit).toSorted(compareStartedAsc);
  if (ordered.length === 0) {
    return {
      stops: [],
      path: [],
      venueCount: 0,
      sessionCount: 0,
      unmappedCount: 0,
      result: checkedMinorUnits(0n),
      startedAt: null,
      finishedAt: null,
    };
  }

  let total = 0n;
  let unmappedCount = 0;
  let minStart = ordered[0]!.visit.startedAt;
  let maxFinish = ordered[0]!.visit.finishedAt!;
  const distinctVenues = new Set<VenueId>();
  const stops: Array<{
    number: number;
    venue: PlacedMapVenue;
    lat: number;
    lng: number;
    result: bigint;
    visits: Array<V>;
  }> = [];

  for (const item of ordered) {
    total += BigInt(item.finalResult!);
    if (ms(item.visit.startedAt) < ms(minStart)) minStart = item.visit.startedAt;
    if (ms(item.visit.finishedAt!) > ms(maxFinish)) maxFinish = item.visit.finishedAt!;
    if (!isPlacedVenue(item.venue)) {
      unmappedCount += 1;
      continue;
    }
    distinctVenues.add(item.venue.id);
    const previous = stops.at(-1);
    if (previous && previous.venue.id === item.venue.id) {
      previous.result += BigInt(item.finalResult!);
      previous.visits.push(item);
    } else {
      stops.push({
        number: stops.length + 1,
        venue: item.venue,
        lat: item.venue.lat,
        lng: item.venue.lng,
        result: BigInt(item.finalResult!),
        visits: [item],
      });
    }
  }

  return {
    stops: stops.map((stop) => {
      const result = checkedMinorUnits(stop.result);
      return {
        number: stop.number,
        venue: stop.venue,
        lat: stop.lat,
        lng: stop.lng,
        result,
        outcome: outcomeOf(result),
        visits: stop.visits,
      };
    }),
    path: stops.map((stop) => ({ latitude: stop.lat, longitude: stop.lng })),
    venueCount: distinctVenues.size,
    sessionCount: ordered.length,
    unmappedCount,
    result: checkedMinorUnits(total),
    startedAt: minStart,
    finishedAt: maxFinish,
  };
};

/** Chronological venue path for one local day, collapsing back-to-back sittings at one casino. */
export const mapDayPath = <V extends MapVisit>(
  visits: ReadonlyArray<V>,
  dayKey: string,
  timeZone: DateTime.TimeZone,
): MapPathSummary<V> =>
  buildPath(
    visits.filter(
      (item) => isFinishedVisit(item) && mapDayKey(item.visit.startedAt, timeZone) === dayKey,
    ),
  );

/** Chronological venue path for all finished visits played inside `tripId`. */
export const mapTripPath = <V extends MapVisit>(
  visits: ReadonlyArray<V>,
  tripId: TripId,
): MapPathSummary<V> =>
  buildPath(visits.filter((item) => isFinishedVisit(item) && item.table.tripId === tripId));

/** Frames all mapped pins in view, using zoom 14 when only a single casino has coordinates. */
export const mapCamera = (
  points: ReadonlyArray<{ readonly lat: number; readonly lng: number }>,
): MapCameraPosition | null => {
  if (points.length === 0) return null;
  if (points.length === 1) {
    return {
      coordinates: { latitude: points[0]!.lat, longitude: points[0]!.lng },
      zoom: 14,
    };
  }
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const span = Math.max(
    Math.max(...lats) - Math.min(...lats),
    Math.max(...lngs) - Math.min(...lngs),
    0.005,
  );
  return {
    coordinates: {
      latitude: (Math.max(...lats) + Math.min(...lats)) / 2,
      longitude: (Math.max(...lngs) + Math.min(...lngs)) / 2,
    },
    zoom: Math.min(16, Math.max(3, Math.log2(360 / span) - 1.2)),
  };
};
