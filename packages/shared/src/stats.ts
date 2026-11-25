import type {
  Game,
  MinorUnits,
  PlayerId,
  Table,
  TripId,
  VenueId,
  VisitId,
  VisitSummary,
} from "@stacks/contracts";
import * as DateTime from "effect/DateTime";

import { checkedMinorUnits } from "./exactMoney.ts";
import { sessionRuns } from "./results.ts";
import { NIGHT_ENDS_HOUR, nextNightKey, nightKey, type TripClock } from "./trips.ts";

type PersonalStatsSession = Pick<VisitSummary, "visit" | "totals" | "finalResult"> & {
  readonly table: Pick<Table, "game" | "venueId" | "tripId">;
};

export type PersonalStatsFilters = {
  readonly year?: number | undefined;
  readonly game?: Table["game"] | undefined;
  readonly venueId?: Table["venueId"] | undefined;
  /** A whole trip, so it replaces the year. */
  readonly tripId?: TripId | undefined;
};

/** A pattern sentence needs this many sessions behind its bucket. */
export const PATTERN_MIN_SESSIONS = 5;

/** A pattern sentence compares, so it needs this many buckets over the floor. */
export const PATTERN_MIN_BUCKETS = 2;

/** The month chart shows from this many played months in its window. */
export const MONTH_CHART_MIN_MONTHS = 3;

/** The night chart shows from this many played nights. */
export const NIGHT_CHART_MIN_NIGHTS = 2;

/** All time shows this many months, ending at the latest one played. */
export const TRAILING_MONTHS = 12;

/** Where one length of session ends and the next begins. */
export const LENGTH_EDGES_HOURS = [1, 2, 3] as const;

const WEEKDAYS = 7;
const HOUR_MS = 3_600_000n;
const LENGTH_EDGES_MS = LENGTH_EDGES_HOURS.map((edge) => BigInt(edge) * HOUR_MS);

const compareKey = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1;

const hours = (milliseconds: bigint) => Number((milliseconds + 18_000n) / 36_000n) / 100;

const roundedQuotient = (numerator: bigint, denominator: bigint) => {
  const magnitude = numerator < 0n ? -numerator : numerator;
  const rounded = (magnitude * 2n + denominator) / (denominator * 2n);

  return checkedMinorUnits(numerator < 0n ? -rounded : rounded);
};

const hourlyResult = (result: number, milliseconds: bigint) =>
  milliseconds === 0n ? null : roundedQuotient(BigInt(result) * HOUR_MS, milliseconds);

/** One bar of a by-month or by-night chart. An unplayed one is a gap, not a break-even. */
export interface PeriodResult {
  /** "2026-03" for a month, "2026-11-06" for a night. */
  readonly key: string;
  readonly sessions: number;
  readonly result: MinorUnits;
  readonly played: boolean;
}

/** Sessions that fell on one weekday, or in one length of session, and what they averaged. */
export interface PatternBucket {
  /** 0 for Sunday to 6; or 0 up through `LENGTH_EDGES_HOURS.length` for lengths. */
  readonly index: number;
  readonly sessions: number;
  readonly result: MinorUnits;
  /** Null with no sessions. */
  readonly average: MinorUnits | null;
}

/**
 * The bucket with the highest average, whatever its sign, once enough of them have the sessions
 * to compare. Null when too few qualify, and on a tie at the top: two buckets that print the same
 * average have no leader.
 */
export const leadingBucket = (buckets: ReadonlyArray<PatternBucket>) => {
  const eligible = buckets.filter((bucket) => bucket.sessions >= PATTERN_MIN_SESSIONS);

  if (eligible.length < PATTERN_MIN_BUCKETS) return null;
  const top = Math.max(...eligible.map((bucket) => bucket.average!));
  const leaders = eligible.filter((bucket) => bucket.average === top);

  return leaders.length === 1 ? leaders[0]! : null;
};

/** A finished session singled out as a record. */
export interface PersonalRecord {
  readonly sessionId: VisitId;
  readonly result: MinorUnits;
  readonly game: Game | null;
  readonly venueId: VenueId | null;
  readonly finishedAt: DateTime.Utc;
}

/**
 * Personal visits from the recording view; live visits never count. An omitted year means
 * all time; omitted game/venue filters mean all, while null selects unset games/venues. A trip
 * shows the whole trip, so it overrides the year.
 * Options come from all finished visits, so filtering never hides the current selection.
 * Hours round the summed elapsed time to two decimals; hourly result uses unrounded time.
 *
 * Months come from the finish, as the year filter does; weekdays and nights from the start. A
 * year's months run to `now`'s month, or to December for a past year; all time shows the
 * trailing months ending at the latest one played. A trip shows its nights instead. A record
 * tied with an earlier one goes to the later session.
 */
export const personalStats = (
  sessions: ReadonlyArray<PersonalStatsSession>,
  timeZone: DateTime.TimeZone,
  filters: PersonalStatsFilters = {},
  now: DateTime.Utc = DateTime.nowUnsafe(),
) => {
  const finished = sessions.flatMap(({ visit, table, finalResult, totals }) =>
    visit.deletedAt !== undefined || visit.finishedAt === null || finalResult === null
      ? []
      : [
          {
            sessionId: visit.id,
            startedAt: visit.startedAt,
            finishedAt: visit.finishedAt,
            year: DateTime.toParts(DateTime.setZone(visit.finishedAt, timeZone)).year,
            milliseconds:
              BigInt(DateTime.toEpochMillis(visit.finishedAt)) -
              BigInt(DateTime.toEpochMillis(visit.startedAt)),
            result: finalResult,
            totals,
            game: table.game,
            venueId: table.venueId,
            tripId: table.tripId,
          },
        ],
  );

  type Finished = (typeof finished)[number];

  const filtered = finished
    .filter(
      (session) =>
        (filters.tripId === undefined
          ? filters.year === undefined || session.year === filters.year
          : session.tripId === filters.tripId) &&
        (filters.game === undefined || session.game === filters.game) &&
        (filters.venueId === undefined || session.venueId === filters.venueId),
    )
    .toSorted(
      (a, b) =>
        DateTime.toEpochMillis(a.finishedAt) - DateTime.toEpochMillis(b.finishedAt) ||
        compareKey(a.sessionId, b.sessionId),
    );

  const measure = (items: ReadonlyArray<Finished>) => {
    let result = 0n;
    let milliseconds = 0n;

    for (const item of items) {
      result += BigInt(item.result);
      milliseconds += item.milliseconds;
    }

    return {
      result: checkedMinorUnits(result),
      sessions: items.length,
      hours: hours(milliseconds),
      milliseconds,
    };
  };

  const { milliseconds, ...summary } = measure(filtered);
  const runs = sessionRuns(filtered.map((item) => item.result));

  const breakdown = <K extends string | null>(key: (session: Finished) => K) => {
    const groups = new Map<K, Array<Finished>>();

    for (const session of filtered) {
      const groupKey = key(session);
      const group = groups.get(groupKey) ?? [];
      group.push(session);
      groups.set(groupKey, group);
    }

    return [...groups]
      .map(([key, group]) => {
        const { milliseconds: _milliseconds, ...row } = measure(group);

        return { key, ...row };
      })
      .toSorted((a, b) =>
        a.result === b.result ? compareKey(a.key, b.key) : a.result > b.result ? -1 : 1,
      );
  };

  const total = (items: ReadonlyArray<Finished>, pick: (session: Finished) => number) =>
    checkedMinorUnits(items.reduce((sum, session) => sum + BigInt(pick(session)), 0n));

  const side = (items: ReadonlyArray<Finished>) => ({
    sessions: items.length,
    result: total(items, (session) => session.result),
  });

  let running = 0n;
  let low = 0n;

  const runningResult = filtered.map(({ sessionId, finishedAt, result }) => {
    running += BigInt(result);
    low = running < low ? running : low;

    return { sessionId, finishedAt, result, total: checkedMinorUnits(running) };
  });

  const buckets = (count: number, pick: (session: Finished) => number) => {
    const sheets = Array.from({ length: count }, () => ({ sessions: 0, result: 0n }));

    for (const session of filtered) {
      const sheet = sheets[pick(session)]!;
      sheet.sessions += 1;
      sheet.result += BigInt(session.result);
    }

    return sheets.map((sheet, index) => ({
      index,
      sessions: sheet.sessions,
      result: checkedMinorUnits(sheet.result),
      average: sheet.sessions === 0 ? null : roundedQuotient(sheet.result, BigInt(sheet.sessions)),
    }));
  };

  const record = (
    outranks: (a: number, b: number) => boolean,
    qualifies: (result: number) => boolean,
  ) => {
    let best: Finished | null = null;

    for (const session of filtered)
      if (!best || !outranks(best.result, session.result)) best = session;

    return best === null || !qualifies(best.result)
      ? null
      : {
          sessionId: best.sessionId,
          result: best.result,
          game: best.game,
          venueId: best.venueId,
          finishedAt: best.finishedAt,
        };
  };

  const periods = () => {
    const sheets = new Map<string, { sessions: number; result: bigint }>();

    const add = (key: string, result: number) => {
      const sheet = sheets.get(key) ?? { sessions: 0, result: 0n };
      sheet.sessions += 1;
      sheet.result += BigInt(result);
      sheets.set(key, sheet);
    };

    const row = (key: string) => {
      const sheet = sheets.get(key);

      return {
        key,
        sessions: sheet?.sessions ?? 0,
        result: checkedMinorUnits(sheet?.result ?? 0n),
        played: sheet !== undefined,
      };
    };

    if (filters.tripId !== undefined) {
      for (const session of filtered) add(nightKey(session.startedAt, timeZone), session.result);
      const keys = [...sheets.keys()].toSorted();

      if (keys.length < NIGHT_CHART_MIN_NIGHTS) return null;
      const rows: Array<PeriodResult> = [];

      for (let key = keys[0]!; key <= keys.at(-1)!; key = nextNightKey(key)) rows.push(row(key));

      return { by: "night" as const, rows };
    }

    const pad = (n: number) => String(n).padStart(2, "0");
    const indexOf = (key: string) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5)) - 1;
    const keyOf = (index: number) => `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;

    for (const session of filtered) {
      const { year, month } = DateTime.toParts(DateTime.setZone(session.finishedAt, timeZone));
      add(`${year}-${pad(month)}`, session.result);
    }

    if (sheets.size < MONTH_CHART_MIN_MONTHS) return null;
    const latest = Math.max(...[...sheets.keys()].map(indexOf));
    const present = DateTime.toParts(DateTime.setZone(now, timeZone));

    const [first, last] =
      filters.year === undefined
        ? [latest - TRAILING_MONTHS + 1, latest]
        : [
            filters.year * 12,
            Math.max(
              latest,
              filters.year === present.year
                ? present.year * 12 + present.month - 1
                : filters.year * 12 + 11,
            ),
          ];

    const rows = Array.from({ length: last - first + 1 }, (_, i) => row(keyOf(first + i)));

    return rows.filter((r) => r.played).length < MONTH_CHART_MIN_MONTHS
      ? null
      : { by: "month" as const, rows };
  };

  return {
    summary: {
      ...summary,
      hourlyResult: hourlyResult(summary.result, milliseconds),
      winRate: { wins: runs.wins, sessions: runs.sessions },
    },
    money: {
      won: side(filtered.filter((session) => session.result > 0)),
      lost: side(filtered.filter((session) => session.result < 0)),
      even: filtered.filter((session) => session.result === 0).length,
      buyIn: total(filtered, (session) => session.totals.buyIn),
      cashOut: total(filtered, (session) => session.totals.cashOut),
      adjustment: total(filtered, (session) => session.totals.adjustment),
    },
    climb: low < 0n && running > low ? checkedMinorUnits(running - low) : null,
    runningResult,
    periods: periods(),
    weekdays: buckets(
      WEEKDAYS,
      (session) => DateTime.toParts(DateTime.setZone(session.startedAt, timeZone)).weekDay,
    ),
    lengths: buckets(
      LENGTH_EDGES_MS.length + 1,
      (session) => LENGTH_EDGES_MS.filter((edge) => session.milliseconds >= edge).length,
    ),
    records: {
      win: record(
        (a, b) => a > b,
        (result) => result > 0,
      ),
      loss: record(
        (a, b) => a < b,
        (result) => result < 0,
      ),
    },
    byGame: breakdown((session) => session.game).map(({ key, ...row }) => ({ game: key, ...row })),
    byCasino: breakdown((session) => session.venueId).map(({ key, ...row }) => ({
      venueId: key,
      ...row,
    })),
    options: {
      years: [...new Set(finished.map((session) => session.year))].toSorted((a, b) => b - a),
      games: [...new Set(finished.map((session) => session.game))].toSorted(compareKey),
      venueIds: [...new Set(finished.map((session) => session.venueId))].toSorted(compareKey),
      tripIds: [
        ...new Set(
          finished
            .toSorted(
              (a, b) => DateTime.toEpochMillis(b.finishedAt) - DateTime.toEpochMillis(a.finishedAt),
            )
            .flatMap((session) => (session.tripId === null ? [] : [session.tripId])),
        ),
      ],
    },
  };
};

/** A finished session or table in one of a group's trips, as group stats read it. */
export interface GroupPlay {
  readonly id: string;
  readonly tripId: TripId;
  readonly game: Game | null;
  readonly venueId: VenueId | null;
  readonly startedAt: DateTime.Utc;
  readonly endedAt: DateTime.Utc;
  /** Group members' results; `milliseconds` is how long that member played. */
  readonly results: ReadonlyArray<{
    readonly playerId: PlayerId;
    readonly buyIn: number;
    readonly net: number;
    readonly milliseconds: number;
  }>;
}

/** A member's place in the group's standings, with their stat sheet. */
export interface GroupStanding {
  readonly playerId: PlayerId;
  /** Equal results share a rank (1, 2, 2, 4). Null for a member with nothing in scope. */
  readonly rank: number | null;
  readonly result: MinorUnits;
  readonly sessions: number;
  readonly hours: number;
  readonly hourlyResult: MinorUnits;
  /** Sessions that came out ahead; an even one counts only in `sessions`. */
  readonly wins: number;
}

/**
 * A group's stats over its finished play, filtered as Just me is: an omitted filter means all,
 * null picks play with it unset, and a trip replaces the period. `members` are the group's current
 * members and guests, in roster order: each appears, last and unranked when they have nothing in
 * scope. A former member appears only with play in scope. Options come from all the play, so
 * filtering never hides the current choice.
 * Hours round the summed elapsed time to two decimals; hourly result uses unrounded time.
 */
export const groupStats = <P extends GroupPlay>(
  plays: ReadonlyArray<P>,
  members: ReadonlyArray<PlayerId>,
  timeZone: DateTime.TimeZone,
  filters: PersonalStatsFilters = {},
) => {
  const yearOf = (play: P) => DateTime.toParts(DateTime.setZone(play.endedAt, timeZone)).year;

  const ordered = plays.toSorted(
    (a, b) =>
      DateTime.toEpochMillis(a.startedAt) - DateTime.toEpochMillis(b.startedAt) ||
      compareKey(a.id, b.id),
  );

  const shown = ordered.filter(
    (play) =>
      (filters.tripId === undefined
        ? filters.year === undefined || yearOf(play) === filters.year
        : play.tripId === filters.tripId) &&
      (filters.game === undefined || play.game === filters.game) &&
      (filters.venueId === undefined || play.venueId === filters.venueId),
  );

  const sheets = new Map<
    PlayerId,
    { result: bigint; sessions: number; milliseconds: bigint; wins: number }
  >();

  for (const playerId of members)
    sheets.set(playerId, { result: 0n, sessions: 0, milliseconds: 0n, wins: 0 });

  for (const play of shown)
    for (const { playerId, net, milliseconds } of play.results) {
      const sheet = sheets.get(playerId) ?? {
        result: 0n,
        sessions: 0,
        milliseconds: 0n,
        wins: 0,
      };

      sheet.result += BigInt(net);
      sheet.sessions += 1;
      sheet.milliseconds += BigInt(Math.max(0, milliseconds));

      if (net > 0) sheet.wins += 1;
      sheets.set(playerId, sheet);
    }

  const rows = Array.from(sheets, ([playerId, sheet]) => ({
    playerId,
    result: checkedMinorUnits(sheet.result),
    sessions: sheet.sessions,
    hours: hours(sheet.milliseconds),
    hourlyResult:
      hourlyResult(checkedMinorUnits(sheet.result), sheet.milliseconds) ?? checkedMinorUnits(0n),
    wins: sheet.wins,
  }));

  const played = rows.filter((row) => row.sessions > 0).toSorted((a, b) => b.result - a.result);

  const standings: ReadonlyArray<GroupStanding> = [
    ...played.map((row) => ({
      ...row,
      rank: 1 + played.filter((other) => other.result > row.result).length,
    })),
    ...rows.filter((row) => row.sessions === 0).map((row) => ({ ...row, rank: null })),
  ];

  const breakdown = <K extends string | null>(key: (play: P) => K) =>
    Array.from(Map.groupBy(shown, key), ([k, group]) => ({
      key: k,
      sessions: group.length,
      appearances: group.reduce((n, play) => n + play.results.length, 0),
      result: checkedMinorUnits(
        group.reduce((sum, play) => sum + play.results.reduce((n, r) => n + BigInt(r.net), 0n), 0n),
      ),
    })).toSorted((a, b) =>
      a.result === b.result ? compareKey(a.key, b.key) : a.result > b.result ? -1 : 1,
    );

  return {
    standings,
    result: checkedMinorUnits(played.reduce((sum, row) => sum + BigInt(row.result), 0n)),
    plays: shown,
    byGame: breakdown((play) => play.game).map(({ key, ...row }) => ({ game: key, ...row })),
    byCasino: breakdown((play) => play.venueId).map(({ key, ...row }) => ({
      venueId: key,
      ...row,
    })),
    options: {
      years: [...new Set(ordered.map(yearOf))].toSorted((a, b) => b - a),
      games: [...new Set(ordered.map((play) => play.game))].toSorted(compareKey),
      venueIds: [...new Set(ordered.map((play) => play.venueId))].toSorted(compareKey),
      tripIds: [...new Set(ordered.toReversed().map((play) => play.tripId))],
    },
  };
};

export type AwardKey = "biggest_hit" | "heater" | "comeback" | "hopper" | "night_owl";

export interface GroupAward {
  readonly key: AwardKey;
  readonly playerId: PlayerId;
  /** What earned it: money for a hit or a comeback, a count for a run or casinos, an hour. */
  readonly value: number;
  /** The session it happened in, for awards about one session. */
  readonly play: GroupPlay | null;
}

const AWARDS: ReadonlyArray<AwardKey> = [
  "biggest_hit",
  "heater",
  "comeback",
  "hopper",
  "night_owl",
];

const lateness = (hour: number) => (hour >= 18 ? hour - 18 : hour < 6 ? hour + 6 : -1);

/**
 * A trip's awards. Each goes to the best player for it who doesn't already hold one, so one hot
 * player doesn't sweep the lot; when everyone eligible already has one, the best takes it anyway.
 */
export const groupAwards = (plays: ReadonlyArray<GroupPlay>, clock: TripClock) => {
  const ordered = plays.toSorted(
    (a, b) => DateTime.toEpochMillis(a.startedAt) - DateTime.toEpochMillis(b.startedAt),
  );

  const players = [...new Set(ordered.flatMap((play) => play.results.map((r) => r.playerId)))];
  const claims = new Map<AwardKey, Array<GroupAward>>(AWARDS.map((key) => [key, []]));

  const claim = (key: AwardKey, playerId: PlayerId, value: number, play: GroupPlay | null) =>
    claims.get(key)!.push({ key, playerId, value, play });

  for (const playerId of players) {
    const mine = ordered.flatMap((play) => {
      const result = play.results.find((r) => r.playerId === playerId);

      return result ? [{ play, net: result.net }] : [];
    });

    const best = mine.reduce((top, m) => (m.net > top.net ? m : top));

    if (best.net > 0) claim("biggest_hit", playerId, best.net, best.play);
    const run = sessionRuns(mine.map((m) => m.net)).longestWinningRun;

    if (run >= 2) claim("heater", playerId, run, null);
    let total = 0;
    let low = 0;

    for (const m of mine) {
      total += m.net;
      low = Math.min(low, total);
    }

    if (low < 0 && total > low) claim("comeback", playerId, total - low, null);
    const venues = new Set(mine.flatMap((m) => (m.play.venueId ? [m.play.venueId] : []))).size;

    if (venues >= 2) claim("hopper", playerId, venues, null);

    const owl = mine.reduce((top, m) =>
      lateness(clock.hour(m.play.startedAt)) > lateness(clock.hour(top.play.startedAt)) ? m : top,
    );

    const owlHour = clock.hour(owl.play.startedAt);

    if (lateness(owlHour) >= 6) claim("night_owl", playerId, owlHour, owl.play);
  }

  const holders = new Set<PlayerId>();

  return AWARDS.flatMap((key) => {
    const ranking = claims
      .get(key)!
      .sort((a, b) =>
        key === "night_owl" ? lateness(b.value) - lateness(a.value) : b.value - a.value,
      );

    const award = ranking.find((c) => !holders.has(c.playerId)) ?? ranking[0];

    if (!award) return [];
    holders.add(award.playerId);

    return [award];
  });
};

/** The trip chart shows this many of the latest trips. */
export const TRIP_BARS_MAX = 8;

/** A bar chart of results needs this many bars to be a chart. */
export const RESULT_BARS_MIN = 2;

/** A trip, or a night, has a leader once this many players have play in it. */
export const LEADER_MIN_PLAYERS = 2;

/** Together shows from this many plays, and Trips from this many trips: one is just the hero. */
export const TOGETHER_MIN_PLAYS = 2;
export const TRIPS_LIST_MIN = 2;

/** The Trips section lists this many rows before "All N trips". */
export const TRIPS_SHOWN = 4;

/** "{name} won N of M" needs this many ended trips behind it. */
export const TRIP_WINS_MIN_ENDED = 2;

/** A trip's awards need this many plays behind them. */
export const AWARDS_MIN_PLAYS = 2;

/** Most tables together: the pair needs this many shared plays. */
export const PAIR_MIN_TABLES = 2;

/** "At tables with a friend" needs this many of your plays with them, and without them. */
export const WITH_WITHOUT_MIN_PLAYS = 5;

/** "You vs a friend" needs this many shared plays. */
export const HEAD_TO_HEAD_MIN_PLAYS = 5;

/** A table everyone finished up at has at least this many group players. */
export const SWEEP_MIN_PLAYERS = 2;

/** "Everyone finished up" shows from this many such tables. */
export const SWEEP_MIN_PLAYS = 1;

/** Shared tables against solo ones needs this many plays on each side. */
export const SHARED_SOLO_MIN_PLAYS = 5;

/** After midnight needs this many appearances on each side. */
export const LATE_MIN_APPEARANCES = 5;

/** After midnight needs this many plays on each side. */
export const LATE_MIN_PLAYS = 3;

/** By game and by casino show from this many plays. */
export const BREAKDOWNS_MIN_PLAYS = 2;

/** Records show from this many plays. */
export const RECORDS_MIN_PLAYS = 2;

/** Best per hour needs this many hours played. */
export const BEST_HOURLY_MIN_HOURS = 10;

/** A player is ranked by return from this many appearances. */
export const RETURN_MIN_APPEARANCES = 3;

/** The Result | Return switch needs this many ranked players. */
export const RETURN_SWITCH_MIN_PLAYERS = 2;

const startedMs = (play: GroupPlay) => DateTime.toEpochMillis(play.startedAt);

const byStart = (a: GroupPlay, b: GroupPlay) =>
  startedMs(a) - startedMs(b) || compareKey(a.id, b.id);

const sumNets = (results: ReadonlyArray<{ readonly net: number }>) =>
  results.reduce((sum, result) => sum + BigInt(result.net), 0n);

const averageOf = (sum: bigint, count: number) => roundedQuotient(sum, BigInt(count));

const barOf = (key: string, plays: ReadonlyArray<GroupPlay> = []) => {
  const nets = new Map<PlayerId, bigint>();

  for (const play of plays)
    for (const { playerId, net } of play.results)
      nets.set(playerId, (nets.get(playerId) ?? 0n) + BigInt(net));

  const top =
    nets.size === 0 ? 0n : [...nets.values()].reduce((best, net) => (net > best ? net : best));

  return {
    key,
    tables: plays.length,
    result: checkedMinorUnits(sumNets(plays.flatMap((play) => play.results))),
    played: plays.length > 0,
    leaders:
      nets.size < LEADER_MIN_PLAYERS
        ? []
        : [...nets].flatMap(([playerId, net]) => (net === top ? [playerId] : [])),
    leaderResult: checkedMinorUnits(top),
    players: nets.size,
  };
};

/** One bar of a group chart: a trip or a night, what the group made in it and who led it. */
export type BarResult = ReturnType<typeof barOf>;

/** A trip as far as the result by trip needs to know it. */
export interface TripSpan {
  readonly id: TripId;
  readonly startedAt: DateTime.Utc;
  /** Null while the trip is active, or reopened. */
  readonly endedAt: DateTime.Utc | null;
}

/**
 * What the group made in each trip with play in `plays`, oldest trip first. A play whose trip isn't
 * in `trips` counts as an ended one that began with its first play.
 */
export const tripResults = (plays: ReadonlyArray<GroupPlay>, trips: ReadonlyArray<TripSpan>) => {
  const spans = new Map(trips.map((trip) => [trip.id, trip]));

  return Array.from(
    Map.groupBy(plays.toSorted(byStart), (play) => play.tripId),
    ([tripId, group]) => {
      const span = spans.get(tripId);

      return {
        ...barOf(tripId, group),
        tripId,
        ended: span === undefined || span.endedAt !== null,
        startedAt: span?.startedAt ?? group[0]!.startedAt,
      };
    },
  ).toSorted(
    (a, b) =>
      DateTime.toEpochMillis(a.startedAt) - DateTime.toEpochMillis(b.startedAt) ||
      compareKey(a.tripId, b.tripId),
  );
};

/** A trip's result; `ended` is false while it's active, or reopened, and so isn't final. */
export type TripResult = ReturnType<typeof tripResults>[number];

/**
 * Who won the most ended trips. Co-wins count for each player. Null on a tie for most wins, and
 * with fewer than `TRIP_WINS_MIN_ENDED` ended trips that had a leader.
 */
export const tripWins = (results: ReadonlyArray<TripResult>) => {
  const decided = results.filter((result) => result.ended && result.leaders.length > 0);
  const wins = new Map<PlayerId, number>();

  for (const result of decided)
    for (const playerId of result.leaders) wins.set(playerId, (wins.get(playerId) ?? 0) + 1);

  const most = Math.max(0, ...wins.values());
  const leaders = [...wins].filter(([, count]) => count === most);

  return {
    ended: decided.length,
    leader:
      decided.length >= TRIP_WINS_MIN_ENDED && leaders.length === 1
        ? { playerId: leaders[0]![0], wins: most }
        : null,
  };
};

/**
 * What the group made on each night of a trip, first night to last, with a gap for a night nobody
 * played. Null with fewer than `RESULT_BARS_MIN` nights played.
 */
export const nightResults = (plays: ReadonlyArray<GroupPlay>, timeZone: DateTime.TimeZone) => {
  const nights = Map.groupBy(plays, (play) => nightKey(play.startedAt, timeZone));
  const keys = [...nights.keys()].toSorted();

  if (keys.length < RESULT_BARS_MIN) return null;
  const rows: Array<BarResult> = [];

  for (let key = keys[0]!; key <= keys.at(-1)!; key = nextNightKey(key))
    rows.push(barOf(key, nights.get(key)));

  return rows;
};

/**
 * Who you share tables with. Players share a table when both have a result at the same play. Every
 * tie on a count goes to the more recent shared play, then to the lower player ID, so a pick is
 * the same on every device.
 */
export const tablemates = (plays: ReadonlyArray<GroupPlay>, me: PlayerId) => {
  const pairs = new Map<
    string,
    { a: PlayerId; b: PlayerId; tables: number; combined: bigint; last: number }
  >();

  for (const play of plays)
    for (const [i, first] of play.results.entries())
      for (const second of play.results.slice(i + 1)) {
        const [a, b] =
          first.playerId < second.playerId
            ? [first.playerId, second.playerId]
            : [second.playerId, first.playerId];

        const key = `${a}|${b}`;
        const pair = pairs.get(key) ?? { a, b, tables: 0, combined: 0n, last: 0 };
        pair.tables += 1;
        pair.combined += BigInt(first.net) + BigInt(second.net);
        pair.last = Math.max(pair.last, startedMs(play));
        pairs.set(key, pair);
      }

  const mostShared = <T extends { tables: number; last: number }>(
    a: T,
    b: T,
    id: (item: T) => string,
  ) => b.tables - a.tables || b.last - a.last || compareKey(id(a), id(b));

  const mine = plays.filter((play) => play.results.some((result) => result.playerId === me));

  const net = (play: GroupPlay, playerId: PlayerId) =>
    BigInt(play.results.find((result) => result.playerId === playerId)?.net ?? 0);

  const friends = new Map<PlayerId, Array<GroupPlay>>();

  for (const play of mine)
    for (const { playerId } of play.results)
      if (playerId !== me) friends.set(playerId, [...(friends.get(playerId) ?? []), play]);

  const [pair] = [...pairs.values()]
    .filter((candidate) => candidate.tables >= PAIR_MIN_TABLES)
    .toSorted((a, b) => mostShared(a, b, (item) => `${item.a}|${item.b}`));

  const [best] = [...friends]
    .flatMap(([friend, together]) => {
      const apart = mine.filter((play) => !together.includes(play));
      const withSum = together.reduce((sum, play) => sum + net(play, me), 0n);
      const withoutSum = apart.reduce((sum, play) => sum + net(play, me), 0n);

      const row = {
        friend,
        withCount: together.length,
        withoutCount: apart.length,
        withSum,
        withoutSum,
        gap: withSum * BigInt(apart.length) - withoutSum * BigInt(together.length),
        scale: BigInt(together.length) * BigInt(apart.length),
        last: Math.max(...together.map(startedMs)),
      };

      return row.withCount >= WITH_WITHOUT_MIN_PLAYS &&
        row.withoutCount >= WITH_WITHOUT_MIN_PLAYS &&
        row.gap > 0n
        ? [row]
        : [];
    })
    .toSorted((a, b) => {
      const larger = b.gap * a.scale - a.gap * b.scale;

      return larger > 0n ? 1 : larger < 0n ? -1 : b.last - a.last || compareKey(a.friend, b.friend);
    });

  const [rival] = [...friends]
    .flatMap(([friend, together]) =>
      together.length >= HEAD_TO_HEAD_MIN_PLAYS
        ? [
            {
              friend,
              together,
              tables: together.length,
              last: Math.max(...together.map(startedMs)),
            },
          ]
        : [],
    )
    .toSorted((a, b) => mostShared(a, b, (item) => item.friend));

  return {
    pair: pair
      ? {
          playerIds: [pair.a, pair.b] as const,
          tables: pair.tables,
          result: checkedMinorUnits(pair.combined),
        }
      : null,
    withWithout: best
      ? {
          friend: best.friend,
          withCount: best.withCount,
          withoutCount: best.withoutCount,
          withAverage: averageOf(best.withSum, best.withCount),
          withoutAverage: averageOf(best.withoutSum, best.withoutCount),
        }
      : null,
    headToHead: rival
      ? {
          friend: rival.friend,
          tables: rival.tables,
          ahead: rival.together.filter((play) => net(play, me) > net(play, rival.friend)).length,
          behind: rival.together.filter((play) => net(play, me) < net(play, rival.friend)).length,
          tied: rival.together.filter((play) => net(play, me) === net(play, rival.friend)).length,
        }
      : null,
  };
};

/**
 * Plays where at least `SWEEP_MIN_PLAYERS` group players all finished above zero, and the one that
 * paid the group most. The latest play takes a tie. Null below `SWEEP_MIN_PLAYS`.
 */
export const sweeps = (plays: ReadonlyArray<GroupPlay>) => {
  const found = plays
    .filter(
      (play) =>
        play.results.length >= SWEEP_MIN_PLAYERS && play.results.every((result) => result.net > 0),
    )
    .toSorted(byStart);

  if (found.length < SWEEP_MIN_PLAYS || found.length === 0) return null;

  const best = found.reduce(
    (top, play) => {
      const combined = sumNets(play.results);

      return combined >= top.combined ? { play, combined } : top;
    },
    { play: found[0]!, combined: sumNets(found[0]!.results) },
  );

  return { count: found.length, play: best.play, result: checkedMinorUnits(best.combined) };
};

const side = (items: ReadonlyArray<GroupPlay>) => {
  const appearances = items.reduce((count, play) => count + play.results.length, 0);
  const sum = sumNets(items.flatMap((play) => play.results));

  return {
    plays: items.length,
    appearances,
    result: checkedMinorUnits(sum),
    average: appearances === 0 ? checkedMinorUnits(0n) : averageOf(sum, appearances),
  };
};

/**
 * Plays with two or more group players against plays with one, each side as a per-appearance
 * average. Null until both have `SHARED_SOLO_MIN_PLAYS` plays.
 */
export const sharedVsSolo = (plays: ReadonlyArray<GroupPlay>) => {
  const shared = plays.filter((play) => play.results.length >= 2);
  const solo = plays.filter((play) => play.results.length === 1);

  if (shared.length < SHARED_SOLO_MIN_PLAYS || solo.length < SHARED_SOLO_MIN_PLAYS) return null;

  return { shared: side(shared), solo: side(solo) };
};

/**
 * Appearances at plays that started from midnight up to 06:00 on `clock`, against the rest. Null
 * until each side has `LATE_MIN_APPEARANCES` appearances over `LATE_MIN_PLAYS` plays.
 */
export const lateNight = (plays: ReadonlyArray<GroupPlay>, clock: TripClock) => {
  const isLate = (play: GroupPlay) => clock.hour(play.startedAt) < NIGHT_ENDS_HOUR;
  const late = side(plays.filter(isLate));
  const other = side(plays.filter((play) => !isLate(play)));

  return [late, other].every(
    (item) => item.appearances >= LATE_MIN_APPEARANCES && item.plays >= LATE_MIN_PLAYS,
  )
    ? { late, other }
    : null;
};

export interface GroupRecord {
  readonly playerId: PlayerId;
  readonly play: GroupPlay;
  readonly value: number;
}

/**
 * The records of the group's play: the biggest win and loss, the longest stay at one table, and
 * the best result per hour. A tie goes to the earliest. Null below `RECORDS_MIN_PLAYS`.
 */
export const groupRecords = (plays: ReadonlyArray<GroupPlay>) => {
  if (plays.length < RECORDS_MIN_PLAYS) return null;
  const ordered = plays.toSorted(byStart);

  const best = (
    value: (result: GroupPlay["results"][number]) => number,
    outranks: (candidate: number, held: number) => boolean,
  ) => {
    let held: GroupRecord | null = null;

    for (const play of ordered)
      for (const result of play.results) {
        const candidate = value(result);

        if (held === null || outranks(candidate, held.value))
          held = { playerId: result.playerId, play, value: candidate };
      }

    return held;
  };

  const win = best(
    (result) => result.net,
    (candidate, held) => candidate > held,
  );

  const loss = best(
    (result) => result.net,
    (candidate, held) => candidate < held,
  );

  const longest = best(
    (result) => result.milliseconds,
    (candidate, held) => candidate > held,
  );

  const players = new Map<PlayerId, { result: bigint; milliseconds: bigint; play: GroupPlay }>();

  for (const play of ordered)
    for (const { playerId, net, milliseconds } of play.results) {
      const held = players.get(playerId) ?? { result: 0n, milliseconds: 0n, play };
      held.result += BigInt(net);
      held.milliseconds += BigInt(Math.max(0, milliseconds));
      players.set(playerId, held);
    }

  let hourly: (GroupRecord & { readonly milliseconds: number }) | null = null;

  for (const [playerId, { result, milliseconds, play }] of players) {
    if (milliseconds < BigInt(BEST_HOURLY_MIN_HOURS) * HOUR_MS) continue;
    const value = hourlyResult(checkedMinorUnits(result), milliseconds);

    if (value !== null && (hourly === null || value > hourly.value))
      hourly = { playerId, play, value, milliseconds: Number(milliseconds) };
  }

  return {
    win: win !== null && win.value > 0 ? win : null,
    loss: loss !== null && loss.value < 0 ? loss : null,
    longest: longest !== null && longest.value > 0 ? longest : null,
    hourly,
  };
};

/**
 * Players ranked by return: their result over everything they bought in for, so players at
 * different stakes compare. Only players with `RETURN_MIN_APPEARANCES` appearances and a buy-in
 * above zero are ranked. Ratios compare by exact cross-multiplication, so equal ones share a rank.
 */
export const returnStandings = (plays: ReadonlyArray<GroupPlay>) => {
  const sheets = new Map<PlayerId, { result: bigint; buyIn: bigint; appearances: number }>();

  for (const play of plays)
    for (const { playerId, net, buyIn } of play.results) {
      const sheet = sheets.get(playerId) ?? { result: 0n, buyIn: 0n, appearances: 0 };
      sheet.result += BigInt(net);
      sheet.buyIn += BigInt(buyIn);
      sheet.appearances += 1;
      sheets.set(playerId, sheet);
    }

  const eligible = [...sheets].flatMap(([playerId, sheet]) =>
    sheet.appearances >= RETURN_MIN_APPEARANCES && sheet.buyIn > 0n ? [{ playerId, ...sheet }] : [],
  );

  const ahead = (a: (typeof eligible)[number], b: (typeof eligible)[number]) =>
    a.result * b.buyIn > b.result * a.buyIn;

  return eligible
    .toSorted((a, b) => (ahead(a, b) ? -1 : ahead(b, a) ? 1 : 0))
    .map((row) => ({
      playerId: row.playerId,
      rank: 1 + eligible.filter((other) => ahead(other, row)).length,
      result: checkedMinorUnits(row.result),
      buyIn: checkedMinorUnits(row.buyIn),
    }));
};
