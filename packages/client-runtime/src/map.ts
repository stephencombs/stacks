import type { MinorUnits, TripId, VenueId, VisitId } from "@stacks/contracts";
import {
  mapCamera,
  mapDayKey,
  mapDayPath,
  mapDays,
  mapPins,
  mapTripPath,
  type MapCameraPosition,
  type MapOutcome,
  type MapPathStop,
  type MapVenuePin,
} from "@stacks/shared/map";
import * as DateTime from "effect/DateTime";
import * as Match from "effect/Match";

import { formatDay, formatDuration, formatTime } from "./format.ts";
import { visitTitle, venuePlace, type RecordedVisit, type RecordingHome } from "./recordingView.ts";
import { formatHours, gameChip, type GameChip } from "./stats.ts";

export type MapFilter =
  | { readonly kind: "all" }
  | { readonly kind: "day"; readonly dayKey: string }
  | { readonly kind: "trip"; readonly tripId: TripId };

export type MapFilterOption = {
  readonly key: string;
  readonly filter: MapFilter;
  readonly label: string;
  readonly subtitle: string;
};

export type MapVenueSessionRow = {
  readonly visitId: VisitId;
  readonly title: string;
  readonly meta: string;
  readonly gameChip: GameChip;
  readonly result: MinorUnits;
  readonly outcome: MapOutcome;
};

export type MapVenueSheetView = {
  readonly venueId: VenueId;
  readonly name: string;
  readonly place: string;
  readonly subtitle: string;
  readonly sessions: number;
  readonly hours: string;
  readonly result: MinorUnits;
  readonly outcome: MapOutcome;
  readonly visits: ReadonlyArray<MapVenueSessionRow>;
};

export type MapPathCard = {
  readonly title: string;
  readonly subtitle: string;
  readonly result: MinorUnits;
  readonly outcome: MapOutcome;
};

export type PersonalMapView =
  | { readonly kind: "empty" }
  | {
      readonly kind: "map";
      readonly filter: MapFilter;
      readonly filterLabel: string;
      readonly filtered: boolean;
      readonly filterOptions: ReadonlyArray<MapFilterOption>;
      readonly pins: ReadonlyArray<MapVenuePin<RecordedVisit>>;
      readonly stops: ReadonlyArray<MapPathStop<RecordedVisit>>;
      readonly path: ReadonlyArray<{ readonly latitude: number; readonly longitude: number }>;
      readonly camera: MapCameraPosition | null;
      readonly summaryCard: MapPathCard | null;
      readonly noLocationLine: string | null;
      readonly unmappedCount: number;
      readonly venueSheet: (venueId: VenueId) => MapVenueSheetView | null;
    };

const casinoCountLabel = (count: number) => `${count} ${count === 1 ? "casino" : "casinos"}`;
const sessionCountLabel = (count: number) => `${count} ${count === 1 ? "session" : "sessions"}`;

const outcomeOf: (amount: number) => MapOutcome = (amount) =>
  amount > 0 ? "win" : amount < 0 ? "loss" : "even";

const dayWeekday = (date: DateTime.Utc, timeZone: DateTime.TimeZone) =>
  DateTime.format(DateTime.setZone(date, timeZone), { weekday: "long" });

const dayShortDate = (date: DateTime.Utc, timeZone: DateTime.TimeZone) =>
  DateTime.format(DateTime.setZone(date, timeZone), { month: "short", day: "numeric" });

const noLocationText = (count: number) =>
  count <= 0 ? null : `${count} ${count === 1 ? "session has" : "sessions have"} no saved location`;

/**
 * Pure presentation model for the Map tab over this device's finished sessions and cached venue
 * coordinates, working signed out and offline.
 */
export const personalMapView: (
  home: Pick<RecordingHome, "finished">,
  tripNames: ReadonlyMap<string, string>,
  timeZone: DateTime.TimeZone,
  filter?: MapFilter,
) => PersonalMapView = (home, tripNames, timeZone, filter = { kind: "all" }) => {
  const finished = home.finished;

  if (finished.length === 0) return { kind: "empty" };

  const allPins = mapPins(finished);
  const days = mapDays(finished, timeZone);

  const weekdayCounts = new Map<string, number>();

  for (const day of days) {
    const wd = dayWeekday(day.date, timeZone);
    weekdayCounts.set(wd, (weekdayCounts.get(wd) ?? 0) + 1);
  }

  const labelForDay = (day: (typeof days)[number]) => {
    const wd = dayWeekday(day.date, timeZone);

    return (weekdayCounts.get(wd) ?? 0) > 1 ? `${wd}, ${dayShortDate(day.date, timeZone)}` : wd;
  };

  const tripIds = [
    ...new Set(finished.flatMap((item) => (item.table.tripId === null ? [] : [item.table.tripId]))),
  ];

  const filterOptions: Array<MapFilterOption> = [
    {
      key: "all",
      filter: { kind: "all" },
      label: "All casinos",
      subtitle: `${casinoCountLabel(allPins.pins.length)} · ${sessionCountLabel(finished.length)}`,
    },
    ...tripIds.map((tripId, index) => {
      const trip = mapTripPath(finished, tripId);
      const name = tripNames.get(tripId) ?? `Trip ${index + 1}`;

      return {
        key: `trip:${tripId}`,
        filter: { kind: "trip" as const, tripId },
        label: name,
        subtitle: `${casinoCountLabel(trip.venueCount)} · ${sessionCountLabel(trip.sessionCount)}`,
      };
    }),
    ...days.map((day) => {
      const wd = dayWeekday(day.date, timeZone);
      const dateText = dayShortDate(day.date, timeZone);

      return {
        key: `day:${day.key}`,
        filter: { kind: "day" as const, dayKey: day.key },
        label: labelForDay(day),
        subtitle: `${dateText === labelForDay(day) ? "" : `${wd}, ${dateText} · `}${sessionCountLabel(day.sessions)}`,
      };
    }),
  ];

  const scopedVisits = Match.value(filter).pipe(
    Match.when({ kind: "all" }, () => finished),
    Match.when({ kind: "day" }, (day) =>
      finished.filter((item) => mapDayKey(item.visit.startedAt, timeZone) === day.dayKey),
    ),
    Match.when({ kind: "trip" }, (trip) =>
      finished.filter((item) => item.table.tripId === trip.tripId),
    ),
    Match.exhaustive,
  );

  const scopedPins = mapPins(scopedVisits);

  let stops: ReadonlyArray<MapPathStop<RecordedVisit>> = [];
  let path: ReadonlyArray<{ readonly latitude: number; readonly longitude: number }> = [];
  let summaryCard: MapPathCard | null = null;
  let unmappedCount = allPins.unmappedCount;
  let filterLabel = "All casinos";

  if (filter.kind === "day") {
    const summary = mapDayPath(finished, filter.dayKey, timeZone);
    const matchingDay = days.find((d) => d.key === filter.dayKey);
    const label = matchingDay ? labelForDay(matchingDay) : filter.dayKey;
    const tripOnDay = scopedVisits.find((v) => v.table.tripId !== null)?.table.tripId;
    const tripPrefix = tripOnDay ? tripNames.get(tripOnDay) : undefined;
    filterLabel = tripPrefix ? `${tripPrefix} · ${label}` : label;
    stops = summary.stops;
    path = summary.path;
    unmappedCount = summary.unmappedCount;

    if (summary.sessionCount > 0 && summary.startedAt && summary.finishedAt) {
      summaryCard = {
        title: `${label} · ${summary.venueCount > 0 ? casinoCountLabel(summary.venueCount) : sessionCountLabel(summary.sessionCount)}`,
        subtitle: `${formatTime(summary.startedAt, timeZone)} to ${formatTime(summary.finishedAt, timeZone)} · in the order you played`,
        result: summary.result,
        outcome: outcomeOf(summary.result),
      };
    }
  } else if (filter.kind === "trip") {
    const summary = mapTripPath(finished, filter.tripId);
    const tripLabel = tripNames.get(filter.tripId) ?? "Trip";
    filterLabel = tripLabel;
    stops = summary.stops;
    path = summary.path;
    unmappedCount = summary.unmappedCount;

    if (summary.sessionCount > 0 && summary.startedAt && summary.finishedAt) {
      summaryCard = {
        title: `${tripLabel} · ${summary.venueCount > 0 ? casinoCountLabel(summary.venueCount) : sessionCountLabel(summary.sessionCount)}`,
        subtitle: `${formatDay(summary.startedAt)} to ${formatDay(summary.finishedAt)} · in the order you played`,
        result: summary.result,
        outcome: outcomeOf(summary.result),
      };
    }
  }

  const cameraPoints =
    stops.length > 0 ? stops : scopedPins.pins.length > 0 ? scopedPins.pins : allPins.pins;

  const venueSheet = (venueId: VenueId) => {
    const pin =
      scopedPins.pins.find((item) => item.venue.id === venueId) ??
      allPins.pins.find((item) => item.venue.id === venueId);

    if (!pin) return null;
    const place = venuePlace(pin.venue);
    const hours = formatHours(pin.hours);

    return {
      venueId: pin.venue.id,
      name: pin.venue.name,
      place,
      subtitle: [place, sessionCountLabel(pin.sessions), hours].filter(Boolean).join(" · "),
      sessions: pin.sessions,
      hours,
      result: pin.result,
      outcome: pin.outcome,
      visits: pin.visits.map((item) => {
        const trip = item.table.tripId ? tripNames.get(item.table.tripId) : undefined;

        return {
          visitId: item.visit.id,
          title: visitTitle(item.table),
          meta: [
            formatDay(item.visit.startedAt),
            trip,
            formatDuration(item.visit.startedAt, item.visit.finishedAt!),
          ]
            .filter(Boolean)
            .join(" · "),
          gameChip: gameChip(item.table.game),
          result: item.finalResult!,
          outcome: outcomeOf(item.finalResult!),
        };
      }),
    };
  };

  return {
    kind: "map",
    filter,
    filterLabel,
    filtered: filter.kind !== "all",
    filterOptions,
    pins: filter.kind === "all" ? allPins.pins : scopedPins.pins,
    stops,
    path,
    camera: mapCamera(cameraPoints),
    summaryCard,
    noLocationLine: noLocationText(unmappedCount),
    unmappedCount,
    venueSheet,
  };
};
