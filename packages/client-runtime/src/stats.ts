import type { Game, Trip, TripId, VenueId } from "@stacks/contracts";
import {
  LENGTH_EDGES_HOURS,
  leadingBucket,
  personalStats,
  type PatternBucket,
  type PersonalStatsFilters,
} from "@stacks/shared/stats";
import * as DateTime from "effect/DateTime";

import { gameNames } from "./format.ts";
import { visitTitle, type RecordedVisit } from "./recordingView.ts";
import { returnLabel } from "./trip.ts";

/** What Stats is filtered to. An omitted key means all; null picks sessions with it unset. */
export type StatsFilters = PersonalStatsFilters;

/** The running line needs at least two points to be a line. */
export const CHART_MIN_SESSIONS = 2;

/** How many casinos show before "See all". */
export const TOP_CASINOS = 4;

export const finishedSessions = (count: number) =>
  `${count} finished ${count === 1 ? "session" : "sessions"}`;

type TripSession = {
  readonly tripId: TripId | null;
  readonly game: Game | null;
  readonly venueId: VenueId | null;
  readonly startedAt: DateTime.Utc;
  readonly endedAt: DateTime.Utc;
};

export type StatsTrip = {
  readonly sessions: number;
  readonly range: string;
};

/** Trip counts ignore the period but keep the game and casino filters. */
export function statsTrips(
  sessions: ReadonlyArray<TripSession>,
  trips: ReadonlyArray<Trip>,
  filters: StatsFilters,
  timeZone: DateTime.TimeZone,
) {
  const counts = new Map<TripId, number>();
  const ranges = new Map<TripId, { start: number; end: number }>();
  let total = 0;

  for (const session of sessions) {
    const matches =
      (filters.game === undefined || filters.game === session.game) &&
      (filters.venueId === undefined || filters.venueId === session.venueId);

    if (matches) total++;
    const id = session.tripId;

    if (id === null) continue;

    if (matches) counts.set(id, (counts.get(id) ?? 0) + 1);
    const start = DateTime.toEpochMillis(session.startedAt);
    const end = DateTime.toEpochMillis(session.endedAt);
    const range = ranges.get(id);
    ranges.set(id, {
      start: Math.min(start, range?.start ?? start),
      end: Math.max(end, range?.end ?? end),
    });
  }

  for (const { id, startedAt, endedAt } of trips) {
    const start = DateTime.toEpochMillis(startedAt);
    ranges.set(id, {
      start,
      end:
        endedAt === null
          ? Math.max(start, ranges.get(id)?.end ?? start)
          : DateTime.toEpochMillis(endedAt),
    });
  }

  const rangeLabel = (start: number, end: number) => {
    const from = DateTime.setZone(DateTime.makeUnsafe(start), timeZone);
    const to = DateTime.setZone(DateTime.makeUnsafe(Math.max(start, end)), timeZone);
    const first = DateTime.toParts(from);
    const last = DateTime.toParts(to);
    const full = { month: "short", day: "numeric", year: "numeric" } as const;

    if (first.year !== last.year)
      return `${DateTime.format(from, full)} – ${DateTime.format(to, full)}`;

    if (first.month !== last.month)
      return `${DateTime.format(from, { month: "short", day: "numeric" })} – ${DateTime.format(to, full)}`;

    if (first.day !== last.day)
      return `${DateTime.format(from, { month: "short", day: "numeric" })}–${last.day}, ${last.year}`;

    return DateTime.format(from, full);
  };

  return {
    total,
    byId: new Map<string, StatsTrip>(
      [...ranges].map(([id, { start, end }]) => [
        id,
        { sessions: counts.get(id) ?? 0, range: rangeLabel(start, end) },
      ]),
    ),
  };
}

export type StatsTrips = ReturnType<typeof statsTrips>;

export const gameName = (game: Game | null) => (game === null ? "No game set" : gameNames[game]);

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

export const gameChip = (game: Game | null) => (game === null ? "grey" : gameChips[game]);

/**
 * Each row's share of the sessions its breakdown covers. A session with no game, casino or seat
 * recorded isn't in that breakdown, so it doesn't shrink the others' bars.
 */
export const sessionShare = (rows: ReadonlyArray<{ readonly sessionCount: number }>) => {
  const total = rows.reduce((sum, row) => sum + row.sessionCount, 0);

  return (row: { readonly sessionCount: number }) => (total === 0 ? 0 : row.sessionCount / total);
};

/** "45m", "6h" or "38h 30m". */
export const formatHours = (hours: number) => {
  const minutes = Math.round(hours * 60);
  const whole = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (whole === 0) return `${minutes}m`;

  return rest === 0 ? `${whole}h` : `${whole}h ${String(rest).padStart(2, "0")}m`;
};

export const played = (sessions: number, hours: number) =>
  `${sessions} ${sessions === 1 ? "session" : "sessions"} · ${formatHours(hours)}`;

const hoursOf = (visits: ReadonlyArray<RecordedVisit>) =>
  visits.reduce(
    (milliseconds, { visit }) =>
      milliseconds +
      DateTime.toEpochMillis(visit.finishedAt!) -
      DateTime.toEpochMillis(visit.startedAt),
    0,
  ) / 3_600_000;

type Choice = {
  readonly value: string;
  readonly label: string;
  /** The filters with this option picked. */
  readonly filters: StatsFilters;
};

export type StatsChip = {
  readonly key: "year" | "game" | "venueId" | "tripId";
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
) => {
  const cleared = { ...filters, [key]: undefined };

  const options = [
    { value: "", label: all, filters: cleared },
    ...values.map((value) => ({ ...describe(value), filters: { ...filters, [key]: value } })),
  ];

  const current = filters[key];

  if (current !== undefined) {
    // SAFETY: a chip's key K is only written with values of V, so a present filter is one of them.
    const selected = describe(current as V);

    if (!options.some((option) => option.value === selected.value))
      options.push({ ...selected, filters });
  }

  // SAFETY: a chip's key K is only written with values of V, so a present filter is one of them.
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

/** Why nothing shows: "No finished Craps sessions at Wynn in 2025." */
export const noMatch = (filters: StatsFilters, casino: string, trip: string) => {
  const game =
    filters.game === undefined ? "" : filters.game === null ? "" : `${gameNames[filters.game]} `;

  const without = [
    filters.game === null ? "a game" : null,
    filters.venueId === null ? "a casino" : null,
  ].filter((part) => part !== null);

  return [
    `No finished ${game}sessions`,
    filters.venueId ? ` at ${casino}` : "",
    filters.tripId !== undefined
      ? ` on ${trip}`
      : filters.year === undefined
        ? ""
        : ` in ${filters.year}`,
    without.length ? ` without ${without.join(" or ")} set` : "",
    ".",
  ].join("");
};

/**
 * The filter chips for what's played: period, game, casino, and a trip once there is one. A trip
 * covers its own dates, so picking one takes the period's place. Applied chips lead, so what the
 * page is showing reads first.
 */
export const filterChips = (
  filters: StatsFilters,
  options: {
    readonly years: ReadonlyArray<number>;
    readonly games: ReadonlyArray<Game | null>;
    readonly venueIds: ReadonlyArray<VenueId | null>;
    readonly tripIds: ReadonlyArray<TripId>;
  },
  names: {
    readonly venueName: (id: VenueId | null) => string;
    readonly tripName: (id: TripId) => string;
  },
) => {
  const trip =
    options.tripIds.length === 0 && filters.tripId === undefined
      ? null
      : chip(filters, "tripId", "Trip", "All trips", options.tripIds, (id) => ({
          value: id,
          label: names.tripName(id),
        }));

  const chips = [
    ...(filters.tripId === undefined
      ? [
          chip(filters, "year", "Period", "All time", options.years, (year) => ({
            value: String(year),
            label: String(year),
          })),
        ]
      : []),
    chip(filters, "game", "Game", "All games", options.games, (game) => ({
      value: game ?? "none",
      label: gameName(game),
    })),
    chip(filters, "venueId", "Casino", "All casinos", options.venueIds, (venueId) => ({
      value: venueId ?? "none",
      label: names.venueName(venueId),
    })),
    ...(trip
      ? [
          {
            ...trip,
            options: trip.options.map((option) => ({
              ...option,
              filters:
                option.value === "" ? option.filters : { ...option.filters, year: undefined },
            })),
          },
        ]
      : []),
  ];

  return {
    chips: [...chips.filter((c) => c.applied), ...chips.filter((c) => !c.applied)],
    filtered: chips.some((c) => c.applied),
  };
};

const monthShort = new Intl.DateTimeFormat(undefined, { month: "short", timeZone: "UTC" });
const monthLong = new Intl.DateTimeFormat(undefined, { month: "long", timeZone: "UTC" });
const weekdayShort = new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" });
const weekdayLong = new Intl.DateTimeFormat(undefined, { weekday: "long", timeZone: "UTC" });

const nightDate = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const dateOfKey = (key: string) => {
  const [year = 0, month = 1, day = 1] = key.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day));
};

/** A night as a bar names it, for a screen reader: "Friday, Nov 6". */
export const nightName = (key: string) =>
  `${weekdayLong.format(dateOfKey(key))}, ${nightDate.format(dateOfKey(key))}`;

/** A night as a bar labels it: the weekday for a short trip, the date past a week. */
export const nightAxisLabel = (key: string, count: number) =>
  count > 7 ? String(dateOfKey(key).getUTCDate()) : weekdayShort.format(dateOfKey(key));

const weekdayName = (index: number) => weekdayLong.format(new Date(Date.UTC(2023, 0, 1 + index)));

const lengthName = (index: number) => {
  const edges = LENGTH_EDGES_HOURS;

  if (index === 0) return `Under ${edges[0]}h`;

  if (index === edges.length) return `${edges[index - 1]}h+`;

  return `${edges[index - 1]}–${edges[index]}h`;
};

const percentOf = (part: number, whole: number) =>
  whole === 0 ? "–" : `${Math.round((part * 100) / whole)}%`;

/** A return on what you bought in for, and which way to color it: by the figure it prints. */
export const returnFigure = (result: number, buyIn: number) => {
  if (buyIn === 0) return { label: returnLabel(null), tone: "none" as const };
  const ratio = result / buyIn;
  const shown = Math.round(ratio * 100);

  return {
    label: returnLabel(ratio),
    tone: shown > 0 ? ("win" as const) : shown < 0 ? ("loss" as const) : ("even" as const),
  };
};

const countOf = (rows: ReadonlyArray<{ readonly status: string }>, status: string) =>
  rows.filter((row) => row.status === status).length;

const AXIS_LABELS = 18;

/**
 * Which columns of an axis of `count` get a label. Past 18 columns the labels thin to every
 * other, then every third, and so on, always keeping the first and the last.
 */
export function axisLabelled(count: number) {
  const step = Math.max(1, Math.ceil(count / AXIS_LABELS));
  const last = count - 1;

  return (index: number) =>
    index === 0 || index === last || (index % step === 0 && last - index >= step);
}

/**
 * Stats as a screen shows them, from the device's visits: the filter chips, then either why
 * there's nothing to show or the hero, money, charts, sentences, records and breakdowns. Live
 * visits never count. `tripNames` names the trips the signed-in account can see; the device
 * alone doesn't know them. `now` bounds a year's months.
 */
export const personalStatsView = (
  visits: ReadonlyArray<RecordedVisit>,
  filters: StatsFilters,
  {
    timeZone = DateTime.zoneMakeLocal(),
    tripNames = new Map(),
    trips = [],
    now = DateTime.nowUnsafe(),
  }: {
    readonly timeZone?: DateTime.TimeZone;
    readonly tripNames?: ReadonlyMap<TripId, string>;
    readonly trips?: ReadonlyArray<Trip>;
    readonly now?: DateTime.Utc;
  } = {},
) => {
  const venues = new Map(
    visits.flatMap(({ venue }) => (venue ? [[venue.id, venue.name] as const] : [])),
  );

  const venueName = (id: VenueId | null) =>
    id === null ? "No casino set" : (venues.get(id) ?? "Casino");

  const tripName = (id: TripId) => tripNames.get(id) ?? "Group trip";
  const stats = personalStats(visits, timeZone, filters, now);

  const finished = visits.flatMap(({ visit, table, finalResult }) =>
    visit.deletedAt !== undefined || visit.finishedAt === null || finalResult === null
      ? []
      : [{ ...table, startedAt: visit.startedAt, endedAt: visit.finishedAt }],
  );

  const head = {
    ...filterChips(filters, stats.options, { venueName, tripName }),
    trips: statsTrips(finished, trips, filters, timeZone),
  };

  if (stats.options.years.length === 0) return { ...head, kind: "empty" as const };
  const { summary } = stats;

  if (summary.sessions === 0)
    return {
      ...head,
      kind: "no_match" as const,
      sentence: noMatch(
        filters,
        venueName(filters.venueId ?? null),
        filters.tripId === undefined ? "" : tripName(filters.tripId),
      ),
    };

  const period =
    filters.tripId !== undefined
      ? tripName(filters.tripId)
      : filters.year === undefined
        ? "all time"
        : String(filters.year);

  const fullDay = (at: DateTime.DateTime) =>
    DateTime.format(DateTime.setZone(at, timeZone), {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const shortDay = (at: DateTime.DateTime) =>
    DateTime.format(DateTime.setZone(at, timeZone), { month: "short", day: "numeric" });

  const yearOf = (at: DateTime.DateTime) => DateTime.toParts(DateTime.setZone(at, timeZone)).year;

  const running = stats.runningResult.map((point) => ({
    ...point,
    at: DateTime.toEpochMillis(point.finishedAt),
    day: fullDay(point.finishedAt),
  }));

  const from = running[0]!.finishedAt;
  const to = running.at(-1)!.finishedAt;

  const day =
    (filters.year !== undefined || filters.tripId !== undefined) && yearOf(from) === yearOf(to)
      ? shortDay
      : fullDay;

  const visit = new Map(visits.map((item) => [item.visit.id, item]));
  const matching = running.map((point) => visit.get(point.sessionId)!);
  const { money } = stats;

  const bars = (() => {
    if (stats.periods === null) return null;
    const { by, rows } = stats.periods;

    const status = (row: (typeof rows)[number]) =>
      !row.played
        ? ("none" as const)
        : row.result > 0
          ? ("up" as const)
          : row.result < 0
            ? ("down" as const)
            : ("even" as const);

    const playedRows = rows.filter((row) => row.played);
    const high = Math.max(...playedRows.map((row) => row.result));
    const low = Math.min(...playedRows.map((row) => row.result));
    const unique = (value: number) => playedRows.filter((row) => row.result === value).length === 1;

    const labelled = axisLabelled(rows.length);

    const items = rows.map((row, index) => {
      const date = dateOfKey(row.key);

      return {
        key: row.key,
        label: !labelled(index)
          ? ""
          : by === "month"
            ? monthShort.format(date)
            : nightAxisLabel(row.key, rows.length),
        year:
          by === "month" && filters.year === undefined && (index === 0 || date.getUTCMonth() === 0)
            ? String(date.getUTCFullYear())
            : null,
        name: by === "month" ? monthLong.format(date) : nightName(row.key),
        result: row.result,
        status: status(row),
        emphasis:
          row.played && ((row.result === high && high > 0) || (row.result === low && low < 0)),
      };
    });

    const noun = by === "month" ? "month" : "night";

    const sentence = (kind: "best" | "worst") => {
      const value = kind === "best" ? high : low;

      if ((kind === "best" ? value <= 0 : value >= 0) || !unique(value)) return [];
      const item = items.find((entry) => entry.status !== "none" && entry.result === value)!;

      return [
        {
          key: kind,
          before:
            kind === "best"
              ? `${item.name} was your best ${noun} at`
              : `${item.name} was your worst at`,
          amount: item.result,
        },
      ];
    };

    return {
      by,
      title: by === "month" ? "By month" : "By night",
      count: `${countOf(items, "up")} up · ${countOf(items, "down")} down`,
      summary: [
        `Result by ${noun}, ${items[0]!.name} to ${items.at(-1)!.name}:`,
        [
          `${countOf(items, "up")} up`,
          `${countOf(items, "down")} down`,
          countOf(items, "even") ? `${countOf(items, "even")} even` : null,
          countOf(items, "none") ? `${countOf(items, "none")} with no play` : null,
        ]
          .filter((part) => part !== null)
          .join(", ") + ".",
      ].join(" "),
      sentences: [...sentence("best"), ...sentence("worst")],
      bars: items,
    };
  })();

  const leader = (
    buckets: ReadonlyArray<PatternBucket>,
    lead: (bucket: PatternBucket) => string,
    tail: (bucket: PatternBucket) => string,
  ) => {
    const top = leadingBucket(buckets);

    return top === null
      ? []
      : [
          {
            key: lead(top),
            before: `${lead(top)} averaged`,
            amount: top.average!,
            after: tail(top),
          },
        ];
  };

  const patterns = [
    ...leader(
      stats.weekdays,
      (bucket) => `${weekdayName(bucket.index)}s`,
      (bucket) => ` a session, across ${bucket.sessions}.`,
    ),
    ...leader(
      stats.lengths,
      (bucket) => `${lengthName(bucket.index)} sessions`,
      (bucket) => `, across ${bucket.sessions}.`,
    ),
  ];

  const record = (kind: "win" | "loss", label: string) => {
    const found = stats.records[kind];

    if (found === null) return [];
    const item = visit.get(found.sessionId)!;

    return [
      {
        key: kind,
        label,
        meta: [
          visitTitle(item.table),
          found.venueId === null ? null : venueName(found.venueId),
          fullDay(found.finishedAt),
        ]
          .filter((part) => part !== null)
          .join(" · "),
        result: found.result,
        visitId: found.sessionId,
      },
    ];
  };

  return {
    ...head,
    kind: "stats" as const,
    title: `Result · ${period}`,
    result: summary.result,
    sessions: summary.sessions,
    hours: formatHours(hoursOf(matching)),
    played: played(summary.sessions, hoursOf(matching)),
    hourlyResult: summary.hourlyResult,
    winRate: percentOf(summary.winRate.wins, summary.winRate.sessions),
    returnRate: returnFigure(summary.result, money.buyIn),
    climb: stats.climb,
    chart:
      summary.sessions < CHART_MIN_SESSIONS
        ? null
        : {
            points: running,
            from: day(from),
            to: day(to),
            low: Math.min(0, ...running.map((point) => point.total)),
            high: Math.max(0, ...running.map((point) => point.total)),
          },
    money: {
      won: money.won,
      lost: money.lost,
      even: money.even,
      buyIn: money.buyIn,
      cashOut: money.cashOut,
      adjustment: money.adjustment === 0 ? null : money.adjustment,
    },
    bars,
    patterns,
    records: [...record("win", "Biggest win"), ...record("loss", "Biggest loss")],
    byGame:
      filters.game !== undefined
        ? null
        : stats.byGame.map((row) => ({
            key: row.game ?? "none",
            label: gameName(row.game),
            meta: played(
              row.sessions,
              hoursOf(matching.filter((item) => item.table.game === row.game)),
            ),
            chip: gameChip(row.game),
            result: row.result,
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
              meta: played(
                row.sessions,
                hoursOf(matching.filter((item) => item.table.venueId === row.venueId)),
              ),
              result: row.result,
              filters: { ...filters, venueId: row.venueId },
            })),
    liveCasino: visits.find(
      ({ visit, finalResult }) =>
        visit.deletedAt === undefined && visit.finishedAt === null && finalResult === null,
    )?.venue?.name,
    casinosLine: `${period === "all time" ? "All time" : period} · ${summary.sessions} finished ${summary.sessions === 1 ? "session" : "sessions"}`,
  };
};

export type PersonalStatsView = ReturnType<typeof personalStatsView>;
