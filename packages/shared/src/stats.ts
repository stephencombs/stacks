import type { PlayerId, Table, VisitSummary } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";

import { checkedMinorUnits } from "./exactMoney.ts";
import { sessionRuns, type SessionRuns } from "./results.ts";

/** A closed session as stats see it, oldest first. */
export interface StatsSession {
  readonly venue: { readonly id: string; readonly name: string };
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

export interface StatSheet<S> {
  readonly total: number;
  readonly runs: SessionRuns;
  /** Each session they played, oldest first. */
  readonly played: ReadonlyArray<{ readonly session: S; readonly net: number }>;
  /** Their best session if they ever finished up, and worst if they ever finished down. */
  readonly best: { readonly session: S; readonly net: number } | null;
  readonly worst: { readonly session: S; readonly net: number } | null;
  /** Across sessions with a recorded buy-in; imported sessions only have a net. */
  readonly averageBuyIn: number | null;
  readonly bestVenue: {
    readonly name: string;
    readonly net: number;
    readonly sessions: number;
  } | null;
  readonly venues: number;
}

/** One player's numbers over the given sessions, or null if they played none of them. */
export const statSheet = <S extends StatsSession>(
  sessions: ReadonlyArray<S>,
  playerId: PlayerId,
): StatSheet<S> | null => {
  const played = sessions.flatMap((session) => {
    const result = session.results.find((r) => r.playerId === playerId);
    return result ? [{ session, net: result.net, buyIn: result.buyIn }] : [];
  });
  if (played.length === 0) return null;

  const byVenue = new Map<string, { name: string; net: number; sessions: number }>();
  for (const { session, net } of played) {
    const venue = byVenue.get(session.venue.id) ?? {
      name: session.venue.name,
      net: 0,
      sessions: 0,
    };
    venue.net += net;
    venue.sessions += 1;
    byVenue.set(session.venue.id, venue);
  }
  const byNet = played.toSorted((a, b) => b.net - a.net);
  const buyIns = played.filter((p) => p.buyIn > 0);
  const bestVenue = [...byVenue.values()].toSorted((a, b) => b.net - a.net)[0]!;

  return {
    total: played.reduce((sum, p) => sum + p.net, 0),
    runs: sessionRuns(played.map((p) => p.net)),
    played: played.map(({ session, net }) => ({ session, net })),
    best: byNet[0]!.net > 0 ? { session: byNet[0]!.session, net: byNet[0]!.net } : null,
    worst:
      byNet.at(-1)!.net < 0 ? { session: byNet.at(-1)!.session, net: byNet.at(-1)!.net } : null,
    averageBuyIn: buyIns.length
      ? Math.round(buyIns.reduce((sum, p) => sum + p.buyIn, 0) / buyIns.length)
      : null,
    bestVenue: bestVenue.net > 0 ? bestVenue : null,
    venues: byVenue.size,
  };
};

type PersonalStatsSession = Pick<VisitSummary, "visit" | "finalResult"> & {
  readonly table: Pick<Table, "game" | "venueId">;
};

export type PersonalStatsFilters = {
  readonly year?: number | undefined;
  readonly game?: Table["game"] | undefined;
  readonly venueId?: Table["venueId"] | undefined;
};

const compareKey = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1;

const hours = (milliseconds: bigint) => Number((milliseconds + 18_000n) / 36_000n) / 100;

// Divide exact minor units by elapsed hours, rounding halves away from zero.
const hourlyResult = (result: number, milliseconds: bigint) => {
  if (milliseconds === 0n) return checkedMinorUnits(0n);
  const numerator = BigInt(result) * 3_600_000n;
  const magnitude = numerator < 0n ? -numerator : numerator;
  const rounded = (magnitude * 2n + milliseconds) / (milliseconds * 2n);
  return checkedMinorUnits(numerator < 0n ? -rounded : rounded);
};

/**
 * Personal visits from the recording view; live visits never count. An omitted year means
 * all time; omitted game/venue filters mean all, while null selects unset games/venues.
 * Options come from all finished visits, so filtering never hides the current selection.
 * Hours round the summed elapsed time to two decimals; hourly result uses unrounded time.
 */
export const personalStats = (
  sessions: ReadonlyArray<PersonalStatsSession>,
  timeZone: DateTime.TimeZone,
  filters: PersonalStatsFilters = {},
) => {
  const finished = sessions.flatMap(({ visit, table, finalResult }) =>
    visit.deletedAt !== undefined || visit.finishedAt === null || finalResult === null
      ? []
      : [
          {
            sessionId: visit.id,
            finishedAt: visit.finishedAt,
            year: DateTime.toParts(DateTime.setZone(visit.finishedAt, timeZone)).year,
            milliseconds:
              BigInt(DateTime.toEpochMillis(visit.finishedAt)) -
              BigInt(DateTime.toEpochMillis(visit.startedAt)),
            result: finalResult,
            game: table.game,
            venueId: table.venueId,
          },
        ],
  );
  const filtered = finished
    .filter(
      (session) =>
        (filters.year === undefined || session.year === filters.year) &&
        (filters.game === undefined || session.game === filters.game) &&
        (filters.venueId === undefined || session.venueId === filters.venueId),
    )
    .toSorted(
      (a, b) =>
        DateTime.toEpochMillis(a.finishedAt) - DateTime.toEpochMillis(b.finishedAt) ||
        compareKey(a.sessionId, b.sessionId),
    );

  const measure = (items: typeof filtered) => {
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

  const breakdown = <K extends string | null>(key: (session: (typeof filtered)[number]) => K) => {
    const groups = new Map<K, typeof filtered>();
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

  let total = 0n;
  return {
    summary: {
      ...summary,
      hourlyResult: hourlyResult(summary.result, milliseconds),
      winRate: { wins: runs.wins, sessions: runs.sessions },
    },
    runningResult: filtered.map(({ sessionId, finishedAt, result }) => {
      total += BigInt(result);
      return { sessionId, finishedAt, result, total: checkedMinorUnits(total) };
    }),
    byGame: breakdown((session) => session.game).map(({ key, ...row }) => ({ game: key, ...row })),
    byCasino: breakdown((session) => session.venueId).map(({ key, ...row }) => ({
      venueId: key,
      ...row,
    })),
    options: {
      years: [...new Set(finished.map((session) => session.year))].toSorted((a, b) => b - a),
      games: [...new Set(finished.map((session) => session.game))].toSorted(compareKey),
      venueIds: [...new Set(finished.map((session) => session.venueId))].toSorted(compareKey),
    },
  };
};
