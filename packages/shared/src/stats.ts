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
import { nextNightKey, nightKey, type TripClock } from "./trips.ts";

/** A closed session as stats see it, oldest first. */
export interface StatsSession {
  /** Null for a table with no casino set. */
  readonly venue: { readonly id: string; readonly name: string } | null;
  readonly results: ReadonlyArray<{
    readonly playerId: PlayerId;
    readonly net: number;
    readonly buyIn: number;
  }>;
}

/** A player's total after each session, carried through the ones they sat out. */
export const runningTotals = (sessions: ReadonlyArray<StatsSession>, playerId: PlayerId) => {
  let total = 0;

  return sessions.map((session) => {
    total += session.results.find((result) => result.playerId === playerId)?.net ?? 0;

    return total;
  });
};

/**
 * A player's return after each session: their running result as a share of everything they've
 * bought in for so far, so players at different stakes compare. Null until they've bought in,
 * which is also how a player who only ever played on someone else's money stays.
 */
export const runningReturns = (sessions: ReadonlyArray<StatsSession>, playerId: PlayerId) => {
  let net = 0;
  let buyIn = 0;

  return sessions.map((session) => {
    const result = session.results.find((r) => r.playerId === playerId);
    net += result?.net ?? 0;
    buyIn += result?.buyIn ?? 0;

    return buyIn > 0 ? net / buyIn : null;
  });
};

/** What the race measures: money won, or return on what each player bought in for. */
export type RaceMeasure = "money" | "return";

/**
 * Each player's race line from break-even: a point per session, carried through ones they sat
 * out. `values` keeps the per-session reading, null for a return before any buy-in.
 */
export const raceLines = (
  sessions: ReadonlyArray<StatsSession>,
  players: ReadonlyArray<PlayerId>,
  measure: RaceMeasure,
) =>
  players.map((playerId) => {
    const values: ReadonlyArray<number | null> =
      measure === "money" ? runningTotals(sessions, playerId) : runningReturns(sessions, playerId);

    return { playerId, values, line: [0, ...values.map((value) => value ?? 0)] };
  });

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
