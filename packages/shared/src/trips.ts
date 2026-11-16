import * as DateTime from "effect/DateTime";
import type { PlayerId, PlayerResult, SessionId, TableId, VenueId } from "@stacks/contracts";

import { sessionRuns } from "./results.ts";

/** The parts of a closed session or table the trip board reads. */
export interface TripSession {
  readonly session: {
    readonly id: SessionId | TableId;
    readonly startedAt: DateTime.Utc;
    /** Played at a high-limit table. */
    readonly highLimit?: boolean;
  };
  /** Null for a table with no casino set. */
  readonly venue: { readonly id: VenueId } | null;
  readonly results: ReadonlyArray<Pick<PlayerResult, "playerId" | "buyIn" | "net">>;
}

/**
 * Local time, supplied by the client. `night` names the night a moment belongs to, so a 2am
 * session counts toward the evening before it; `hour` is the local hour, 0 to 23.
 */
export interface TripClock {
  readonly night: (at: DateTime.Utc) => string;
  readonly hour: (at: DateTime.Utc) => number;
}

export interface TripStanding {
  readonly playerId: PlayerId;
  readonly net: number;
  readonly sessions: number;
  readonly rank: number;
  /** Places gained since the latest night began; negative when they dropped. */
  readonly moved: number;
  /** Three or more winning sessions in a row, up to now. */
  readonly hot: boolean;
  /** Their latest run of wins or losses; an even session ends it. */
  readonly streak: { readonly length: number; readonly winning: boolean };
}

export interface TripNight<S> {
  readonly key: string;
  /** 1 for the trip's first night. */
  readonly number: number;
  readonly sessions: ReadonlyArray<S>;
  readonly winner: { readonly playerId: PlayerId; readonly net: number } | null;
}

const startOf = (s: TripSession) => DateTime.toEpochMillis(s.session.startedAt);

const netsOf = (sessions: ReadonlyArray<TripSession>) => {
  const nets = new Map<PlayerId, number>();
  for (const s of sessions)
    for (const r of s.results) nets.set(r.playerId, (nets.get(r.playerId) ?? 0) + r.net);
  return nets;
};

/**
 * Highest net first. Equal nets share a rank (1, 2, 2, 4) and keep the order players first
 * appeared in, as group stats rank them.
 */
const ranked = (nets: ReadonlyMap<PlayerId, number>) => {
  const order = Array.from(nets)
    .map(([playerId, net], index) => ({ playerId, net, index }))
    .sort((a, b) => b.net - a.net || a.index - b.index);
  return new Map(
    order.map(({ playerId, net }) => [playerId, 1 + order.filter((o) => o.net > net).length]),
  );
};

/** The trip's sessions oldest first, grouped into nights. */
export const tripNights = <S extends TripSession>(
  sessions: ReadonlyArray<S>,
  clock: TripClock,
): ReadonlyArray<TripNight<S>> => {
  const nights: Array<{ key: string; sessions: Array<S> }> = [];
  for (const s of sessions.toSorted((a, b) => startOf(a) - startOf(b))) {
    const key = clock.night(s.session.startedAt);
    const last = nights.at(-1);
    if (last?.key === key) last.sessions.push(s);
    else nights.push({ key, sessions: [s] });
  }
  return nights.map((night, index) => {
    const [top] = Array.from(netsOf(night.sessions)).sort((a, b) => b[1] - a[1]);
    return {
      key: night.key,
      number: index + 1,
      sessions: night.sessions,
      winner: top ? { playerId: top[0], net: top[1] } : null,
    };
  });
};

/** Everyone who played, ranked by trip net, with how far they moved since tonight began. */
export const tripStandings = (
  sessions: ReadonlyArray<TripSession>,
  clock: TripClock,
): ReadonlyArray<TripStanding> => {
  const ordered = sessions.toSorted((a, b) => startOf(a) - startOf(b));
  const nights = tripNights(ordered, clock);
  const tonight = nights.at(-1)?.sessions.length ?? 0;
  const before = ranked(netsOf(ordered.slice(0, ordered.length - tonight)));
  const nets = netsOf(ordered);
  const now = ranked(nets);
  return Array.from(now, ([playerId, rank]) => {
    const mine = ordered.flatMap((s) => s.results.filter((r) => r.playerId === playerId));
    const runs = sessionRuns(mine.map((r) => r.net));
    const was = before.get(playerId);
    return {
      playerId,
      net: nets.get(playerId)!,
      sessions: mine.length,
      rank,
      moved: was === undefined ? 0 : was - rank,
      hot: runs.current.winning && runs.current.length >= 3,
      streak: runs.current,
    };
  });
};

/** One player's trip: where it stands, the line it drew from zero session by session, and how it went. */
export interface PlayerTrip<S> {
  readonly net: number;
  /** 0, then their total after each session they played, oldest first. */
  readonly line: ReadonlyArray<number>;
  readonly played: number;
  readonly won: number;
  /** The lowest point of the line, 0 if they never went under. */
  readonly low: number;
  readonly best: { readonly net: number; readonly session: S } | null;
}

export const playerTrip = <S extends TripSession>(
  sessions: ReadonlyArray<S>,
  playerId: PlayerId,
): PlayerTrip<S> => {
  const mine = sessions
    .toSorted((a, b) => startOf(a) - startOf(b))
    .flatMap((session) =>
      session.results
        .filter((result) => result.playerId === playerId)
        .map((result) => ({ session, net: result.net as number })),
    );
  const line = [0];
  for (const { net } of mine) line.push(line.at(-1)! + net);
  return {
    net: line.at(-1)!,
    line,
    played: mine.length,
    won: mine.filter((m) => m.net > 0).length,
    low: Math.min(...line),
    best: mine.reduce<PlayerTrip<S>["best"]>(
      (best, m) => (!best || m.net > best.net ? m : best),
      null,
    ),
  };
};

/** A live table as the board reads it. */
export interface LiveTable {
  readonly results: ReadonlyArray<Pick<PlayerResult, "playerId" | "buyIn" | "net">>;
  /** Seated and not cashed out. */
  readonly playing: ReadonlyArray<PlayerId>;
  /**
   * A table recorded from Play has this: what each open visit has bought in for. Its `results`
   * are then finished visits only, settled even for a player who sat back down.
   */
  readonly inPlay?: ReadonlyArray<{ readonly playerId: PlayerId; readonly buyIn: number }>;
}

export interface TonightRow {
  readonly playerId: PlayerId;
  /**
   * Won or lost tonight in finished play: closed tables, and cash-outs at live ones. Null for
   * someone whose only play tonight is still going.
   */
  readonly net: number | null;
  /** What they've bought in for at tables they're still playing. Not a loss until they leave. */
  readonly inPlay: number;
  readonly rank: number;
}

/** What each player still at a live table has bought in for there. */
export const inPlay = (live: ReadonlyArray<LiveTable>): ReadonlyMap<PlayerId, number> => {
  const amounts = new Map<PlayerId, number>();
  for (const table of live)
    for (const r of table.inPlay ?? table.results.filter((r) => table.playing.includes(r.playerId)))
      amounts.set(r.playerId, (amounts.get(r.playerId) ?? 0) + r.buyIn);
  return amounts;
};

/** Who's up tonight: tonight's finished play, best first, with what anyone has in play. */
export const tonightBoard = (
  closed: ReadonlyArray<TripSession>,
  live: ReadonlyArray<LiveTable>,
  clock: TripClock,
  now: DateTime.Utc,
): ReadonlyArray<TonightRow> => {
  const tonight = clock.night(now);
  const finished = [
    ...closed
      .filter((s) => clock.night(s.session.startedAt) === tonight)
      .toSorted((a, b) => startOf(a) - startOf(b))
      .flatMap((s) => s.results),
    ...live.flatMap((table) =>
      table.inPlay
        ? table.results
        : table.results.filter((r) => !table.playing.includes(r.playerId)),
    ),
  ];
  const nets = new Map<PlayerId, number>();
  for (const r of finished) nets.set(r.playerId, (nets.get(r.playerId) ?? 0) + r.net);
  const playing = inPlay(live);
  const players = new Set([...nets.keys(), ...playing.keys()]);
  return Array.from(players, (playerId) => ({
    playerId,
    net: nets.get(playerId) ?? null,
    inPlay: playing.get(playerId) ?? 0,
  }))
    .toSorted((a, b) => (b.net ?? 0) - (a.net ?? 0))
    .map((row, index) => ({ ...row, rank: index + 1 }));
};

/** The latest results, newest session first and its biggest swings first: the ticker. */
export const tripFeed = <S extends TripSession>(sessions: ReadonlyArray<S>, limit = 8) =>
  sessions
    .toSorted((a, b) => startOf(b) - startOf(a))
    .flatMap((session) =>
      session.results
        .toSorted((a, b) => Math.abs(b.net) - Math.abs(a.net))
        .slice(0, 2)
        .map((r) => ({ session, playerId: r.playerId, net: r.net })),
    )
    .slice(0, limit);

export interface TripDay {
  readonly key: string;
  /** 1 for the trip's first night. */
  readonly number: number;
  readonly sessions: number;
  /** Everyone on the trip, best night first; null for someone who didn't play that night. */
  readonly rows: ReadonlyArray<{
    readonly playerId: PlayerId;
    readonly net: number | null;
    readonly wins: number;
    readonly losses: number;
    readonly even: number;
  }>;
}

/**
 * The trip night by night, for every player. Someone who sat a night out shows as no result,
 * never as breaking even.
 */
export const tripDays = (
  sessions: ReadonlyArray<TripSession>,
  clock: TripClock,
  players: ReadonlyArray<PlayerId>,
): ReadonlyArray<TripDay> =>
  tripNights(sessions, clock).map((night) => {
    const rows = players.map((playerId) => {
      const mine = night.sessions.flatMap((s) => s.results.filter((r) => r.playerId === playerId));
      return {
        playerId,
        net: mine.length === 0 ? null : mine.reduce((sum, r) => sum + r.net, 0),
        wins: mine.filter((r) => r.net > 0).length,
        losses: mine.filter((r) => r.net < 0).length,
        even: mine.filter((r) => r.net === 0).length,
      };
    });
    return {
      key: night.key,
      number: night.number,
      sessions: night.sessions.length,
      rows: rows.toSorted(
        (a, b) =>
          (a.net === null ? 1 : 0) - (b.net === null ? 1 : 0) || (b.net ?? 0) - (a.net ?? 0),
      ),
    };
  });

export interface RouteStop<V> {
  readonly venue: V;
  /** 1 for the first casino visited. */
  readonly number: number;
  readonly visits: number;
  /** The group's net there. */
  readonly net: number;
}

/**
 * Where the trip went: each casino once, numbered in the order it was first visited, and the path
 * between them in the order the sessions were played, a casino repeated only after leaving it.
 * Tables with no casino set aren't on it.
 */
export const tripRoute = <S extends TripSession>(sessions: ReadonlyArray<S>) => {
  type Venue = NonNullable<S["venue"]>;
  const stops = new Map<VenueId, { venue: Venue; number: number; visits: number; net: number }>();
  const path: Array<Venue> = [];
  const placed = sessions.filter((s): s is S & { readonly venue: Venue } => s.venue !== null);
  for (const s of placed.toSorted((a, b) => startOf(a) - startOf(b))) {
    const stop = stops.get(s.venue.id) ?? {
      venue: s.venue,
      number: stops.size + 1,
      visits: 0,
      net: 0,
    };
    stop.visits += 1;
    stop.net += s.results.reduce((sum, r) => sum + r.net, 0);
    stops.set(s.venue.id, stop);
    if (path.at(-1)?.id !== s.venue.id) path.push(s.venue);
  }
  return { stops: [...stops.values()] as ReadonlyArray<RouteStop<Venue>>, path };
};
