import type { Game, VenueId } from "@stacks/contracts";
import { personalStats, type PersonalStatsFilters } from "@stacks/shared/stats";
import * as DateTime from "effect/DateTime";

import { gameNames } from "./format.ts";
import { visitTitle, type RecordedVisit } from "./recordingView.ts";

/** What Stats is filtered to. An omitted key means all; null picks sessions with it unset. */
export type StatsFilters = PersonalStatsFilters;

/** Up to this many sessions read better as a list of them than as a running line. */
const FEW = 3;

/** How many casinos show before "See all". */
export const TOP_CASINOS = 2;

const gameName = (game: Game | null) => (game === null ? "No game set" : gameNames[game]);

/** Each game's chip color, as the design tokens assign them. */
const gameChips = {
  slots: "orange",
  blackjack: "black",
  roulette: "green",
  craps: "red",
  baccarat: "purple",
  poker_cash: "blue",
  poker_tourney: "blue",
  other: "grey",
} as const;

export type GameChip = (typeof gameChips)[Game];

const gameChip = (game: Game | null): GameChip => (game === null ? "grey" : gameChips[game]);

/** "45m", "6h" or "38h 30m". */
export const formatHours = (hours: number) => {
  const minutes = Math.round(hours * 60);
  const whole = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (whole === 0) return `${minutes}m`;
  return rest === 0 ? `${whole}h` : `${whole}h ${String(rest).padStart(2, "0")}m`;
};

const played = (sessions: number, hours: number) =>
  `${sessions} ${sessions === 1 ? "session" : "sessions"} · ${formatHours(hours)}`;

const fullDay = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const shortDay = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

type Choice = {
  readonly value: string;
  readonly label: string;
  /** The filters with this option picked. */
  readonly filters: StatsFilters;
};

export type StatsChip = {
  readonly key: "year" | "game" | "venueId";
  /** What the chip filters, for a screen reader: "Period". */
  readonly name: string;
  readonly label: string;
  readonly applied: boolean;
  /** The picked option's `value`. */
  readonly value: string;
  readonly options: ReadonlyArray<Choice>;
  /** The filters with this chip cleared. */
  readonly cleared: StatsFilters;
};

const chip = <K extends StatsChip["key"], V>(
  filters: StatsFilters,
  key: K,
  name: string,
  all: string,
  values: ReadonlyArray<V>,
  describe: (value: V) => { value: string; label: string },
): StatsChip => {
  const cleared = { ...filters, [key]: undefined };
  const options = [
    { value: "", label: all, filters: cleared },
    ...values.map((value) => ({ ...describe(value), filters: { ...filters, [key]: value } })),
  ];
  const current = filters[key];
  const picked =
    current === undefined
      ? options[0]!
      : (options.find((option) => option.value === describe(current as V).value) ?? options[0]!);
  return {
    key,
    name,
    label: picked.label,
    applied: current !== undefined,
    value: picked.value,
    options,
    cleared,
  };
};

const noMatch = (filters: StatsFilters, casino: string) => {
  const game =
    filters.game === undefined ? "" : filters.game === null ? "" : `${gameNames[filters.game]} `;
  const without = [
    filters.game === null ? "a game" : null,
    filters.venueId === null ? "a casino" : null,
  ].filter((part) => part !== null);
  return [
    `No finished ${game}sessions`,
    filters.venueId ? ` at ${casino}` : "",
    filters.year === undefined ? "" : ` in ${filters.year}`,
    without.length ? ` without ${without.join(" or ")} set` : "",
    ".",
  ].join("");
};

/**
 * Stats as a screen shows them, from the device's visits: the filter chips, then either why
 * there's nothing to show or the summary, running line and breakdowns. Live visits never count.
 */
export const personalStatsView = (
  visits: ReadonlyArray<RecordedVisit>,
  filters: StatsFilters,
  timeZone: DateTime.TimeZone = DateTime.zoneMakeLocal(),
) => {
  const venues = new Map(
    visits.flatMap(({ venue }) => (venue ? [[venue.id, venue.name] as const] : [])),
  );
  const venueName = (id: VenueId | null) =>
    id === null ? "No casino set" : (venues.get(id) ?? "Casino");
  const stats = personalStats(visits, timeZone, filters);
  const chips = [
    chip(filters, "year", "Period", "All time", stats.options.years, (year) => ({
      value: String(year),
      label: String(year),
    })),
    chip(filters, "game", "Game", "All games", stats.options.games, (game) => ({
      value: game ?? "none",
      label: gameName(game),
    })),
    chip(filters, "venueId", "Casino", "All casinos", stats.options.venueIds, (venueId) => ({
      value: venueId ?? "none",
      label: venueName(venueId),
    })),
  ];
  const head = {
    // Applied filters lead, so what the page is showing reads first.
    chips: [...chips.filter((c) => c.applied), ...chips.filter((c) => !c.applied)],
    filtered: chips.some((c) => c.applied),
  };
  if (stats.options.years.length === 0) return { ...head, kind: "empty" as const };
  const { summary } = stats;
  if (summary.sessions === 0)
    return {
      ...head,
      kind: "no_match" as const,
      sentence: noMatch(filters, venueName(filters.venueId ?? null)),
    };

  const period = filters.year === undefined ? "all time" : String(filters.year);
  const day = filters.year === undefined ? fullDay : shortDay;
  const running = stats.runningResult.map((point) => ({
    ...point,
    at: DateTime.toEpochMillis(point.finishedAt),
    day: fullDay.format(DateTime.toDateUtc(point.finishedAt)),
  }));
  const visit = new Map(visits.map((item) => [item.visit.id, item]));
  const biggest = Math.max(...stats.byGame.map((row) => Math.abs(row.result)));

  return {
    ...head,
    kind: "stats" as const,
    title: `Result · ${period}`,
    result: summary.result,
    sessions: summary.sessions,
    hours: formatHours(summary.hours),
    hourlyResult: summary.hourlyResult,
    winRate: `${Math.round((summary.winRate.wins * 100) / summary.winRate.sessions)}%`,
    winRateLine: `${summary.winRate.wins} of ${summary.winRate.sessions}`,
    chart:
      summary.sessions <= FEW
        ? null
        : {
            points: running,
            from: day.format(DateTime.toDateUtc(running[0]!.finishedAt)),
            to: day.format(DateTime.toDateUtc(running.at(-1)!.finishedAt)),
          },
    list:
      summary.sessions > FEW
        ? null
        : running.toReversed().map((point) => {
            const item = visit.get(point.sessionId)!;
            const hours =
              (DateTime.toEpochMillis(point.finishedAt) -
                DateTime.toEpochMillis(item.visit.startedAt)) /
              3_600_000;
            return {
              key: point.sessionId,
              title: visitTitle(item.table),
              meta: `${point.day} · ${formatHours(hours)}`,
              chip: gameChip(item.table.game),
              result: point.result,
            };
          }),
    // A breakdown by the thing already filtered to would be a single row.
    byGame:
      filters.game !== undefined
        ? null
        : stats.byGame.map((row) => ({
            key: row.game ?? "none",
            label: gameName(row.game),
            meta: played(row.sessions, row.hours),
            chip: gameChip(row.game),
            result: row.result,
            share: biggest === 0 ? 0 : Math.abs(row.result) / biggest,
            filters: { ...filters, game: row.game },
          })),
    byCasino:
      filters.venueId !== undefined
        ? null
        : stats.byCasino
            .toSorted((a, b) => b.sessions - a.sessions)
            .map((row) => ({
              key: row.venueId ?? "none",
              label: venueName(row.venueId),
              meta: played(row.sessions, row.hours),
              result: row.result,
              filters: { ...filters, venueId: row.venueId },
            })),
    casinosLine: `${period === "all time" ? "All time" : period} · ${summary.sessions} finished ${summary.sessions === 1 ? "session" : "sessions"}`,
  };
};

export type PersonalStatsView = ReturnType<typeof personalStatsView>;
