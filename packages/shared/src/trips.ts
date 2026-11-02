import * as DateTime from "effect/DateTime";
import type { PlayerId, PlayerResult, SessionId, VenueId } from "@stacks/contracts";

import { sessionRuns } from "./results.ts";

/** The parts of a closed session the trip board reads. */
export interface TripSession {
  readonly session: {
    readonly id: SessionId;
    readonly startedAt: DateTime.Utc;
    /** Played at a high-limit table. */
    readonly highLimit?: boolean;
  };
  readonly venue: { readonly id: VenueId };
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

export type AwardKey =
  | "biggest_hit"
  | "heater"
  | "comeback"
  | "hopper"
  | "whale"
  | "night_owl"
  | "rough_night";

export interface TripAward<S> {
  readonly key: AwardKey;
  readonly playerId: PlayerId;
  /** What earned it: money for hits, buy-ins and comebacks; a count for runs and casinos; an hour. */
  readonly value: number;
  /** The session it happened in, for awards about one session. */
  readonly session: S | null;
}

/** Awards in the order they're handed out; earlier awards get first pick of the players. */
const ORDER: ReadonlyArray<AwardKey> = [
  "biggest_hit",
  "heater",
  "comeback",
  "hopper",
  "whale",
  "night_owl",
  "rough_night",
];

const startOf = (s: TripSession) => DateTime.toEpochMillis(s.session.startedAt);

const netsOf = (sessions: ReadonlyArray<TripSession>) => {
  const nets = new Map<PlayerId, number>();
  for (const s of sessions)
    for (const r of s.results) nets.set(r.playerId, (nets.get(r.playerId) ?? 0) + r.net);
  return nets;
};

/** Highest net first; ties keep the order players first appeared in. */
const ranked = (nets: ReadonlyMap<PlayerId, number>) =>
  new Map(
    Array.from(nets)
      .map(([playerId, net], index) => ({ playerId, net, index }))
      .sort((a, b) => b.net - a.net || a.index - b.index)
      .map(({ playerId }, index) => [playerId, index + 1]),
  );

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

/** A live table as the board reads it. */
export interface LiveTable {
  readonly results: ReadonlyArray<Pick<PlayerResult, "playerId" | "buyIn" | "net">>;
  /** Seated and not cashed out. */
  readonly playing: ReadonlyArray<PlayerId>;
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
    for (const r of table.results)
      if (table.playing.includes(r.playerId))
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
    ...live.flatMap((table) => table.results.filter((r) => !table.playing.includes(r.playerId))),
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

/** Hours into the night: 6pm is 0, 2am is 8. Daytime is -1 and never wins Night Owl. */
const lateness = (hour: number) => (hour >= 18 ? hour - 18 : hour < 6 ? hour + 6 : -1);

/**
 * The trip's awards. Each award goes to the best player for it who doesn't already hold one,
 * so one hot player doesn't sweep the lot; when everyone eligible already has an award, the
 * best of them takes it anyway.
 */
export const tripAwards = <S extends TripSession>(
  sessions: ReadonlyArray<S>,
  clock: TripClock,
): ReadonlyArray<TripAward<S>> => {
  const ordered = sessions.toSorted((a, b) => startOf(a) - startOf(b));
  const players = Array.from(netsOf(ordered).keys());
  const played = (playerId: PlayerId) =>
    ordered.flatMap((session) => {
      const result = session.results.find((r) => r.playerId === playerId);
      return result ? [{ session, ...result }] : [];
    });

  // Every eligible claim on each award, best first.
  const claims = new Map<AwardKey, Array<TripAward<S>>>(ORDER.map((key) => [key, []]));
  const claim = (key: AwardKey, playerId: PlayerId, value: number, session: S | null) =>
    claims.get(key)!.push({ key, playerId, value, session });
  for (const playerId of players) {
    const mine = played(playerId);
    const best = mine.reduce((top, m) => (m.net > top.net ? m : top));
    if (best.net > 0) claim("biggest_hit", playerId, best.net, best.session);
    const worst = mine.reduce((low, m) => (m.net < low.net ? m : low));
    if (worst.net < 0) claim("rough_night", playerId, -worst.net, worst.session);
    const run = sessionRuns(mine.map((m) => m.net)).longestWinningRun;
    if (run >= 2) claim("heater", playerId, run, null);
    let total = 0;
    let low = 0;
    for (const m of mine) {
      total += m.net;
      low = Math.min(low, total);
    }
    if (low < 0 && total > low) claim("comeback", playerId, total - low, null);
    const venues = new Set(mine.map((m) => m.session.venue.id)).size;
    if (venues >= 2) claim("hopper", playerId, venues, null);
    const whale = mine.reduce((top, m) => (m.buyIn > top.buyIn ? m : top));
    if (whale.buyIn > 0) claim("whale", playerId, whale.buyIn, whale.session);
    const owl = mine.reduce((top, m) =>
      lateness(clock.hour(m.session.session.startedAt)) >
      lateness(clock.hour(top.session.session.startedAt))
        ? m
        : top,
    );
    const owlHour = clock.hour(owl.session.session.startedAt);
    if (lateness(owlHour) >= 6) claim("night_owl", playerId, owlHour, owl.session);
  }

  const lateFirst = (a: TripAward<S>, b: TripAward<S>) =>
    a.key === "night_owl" ? lateness(b.value) - lateness(a.value) : b.value - a.value;
  const holders = new Set<PlayerId>();
  return ORDER.flatMap((key) => {
    const ranking = claims.get(key)!.sort(lateFirst);
    const award = ranking.find((c) => !holders.has(c.playerId)) ?? ranking[0];
    if (!award) return [];
    holders.add(award.playerId);
    return [award];
  });
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

/**
 * How a table went for the group: a win when everyone who played it won, a loss when everyone
 * lost, mixed otherwise (an even result included). Players who sat out don't count.
 */
export type TeamResult = "win" | "loss" | "mixed";

export const teamResult = (s: TripSession): TeamResult =>
  s.results.length > 0 && s.results.every((r) => r.net > 0)
    ? "win"
    : s.results.length > 0 && s.results.every((r) => r.net < 0)
      ? "loss"
      : "mixed";

export interface TripStats {
  readonly sessions: number;
  readonly net: number;
  /** Every winning player result added up, and every losing one. */
  readonly grossWins: number;
  readonly grossLosses: number;
  readonly record: { readonly wins: number; readonly losses: number; readonly mixed: number };
  /** The share of tables everyone won, mixed tables included in the count. */
  readonly winRate: number;
  /** The group's net per table. */
  readonly average: number;
  /** The best and worst single player result at one table. */
  readonly best: { readonly playerId: PlayerId; readonly net: number } | null;
  readonly worst: { readonly playerId: PlayerId; readonly net: number } | null;
  /** The biggest fall in the group's running total from a high it had reached; 0 or less. */
  readonly drawdown: number;
  readonly team: {
    /** The run the group is on now; mixed tables end a run. */
    readonly current: { readonly result: "win" | "loss"; readonly length: number } | null;
    readonly longestWin: number;
    readonly longestLoss: number;
  };
  readonly highLimit: { readonly net: number; readonly sessions: number };
  readonly otherTables: { readonly net: number; readonly sessions: number };
}

/** The numbers behind a trip: totals, extremes, how the group ran, and high-limit play. */
export const tripStats = (sessions: ReadonlyArray<TripSession>): TripStats => {
  const ordered = sessions.toSorted((a, b) => startOf(a) - startOf(b));
  let grossWins = 0;
  let grossLosses = 0;
  let best: TripStats["best"] = null;
  let worst: TripStats["worst"] = null;
  let running = 0;
  let peak = 0;
  let drawdown = 0;
  const record = { wins: 0, losses: 0, mixed: 0 };
  let current = null as TripStats["team"]["current"];
  let longestWin = 0;
  let longestLoss = 0;
  const high = { net: 0, sessions: 0 };
  const other = { net: 0, sessions: 0 };
  for (const s of ordered) {
    let net = 0;
    for (const r of s.results) {
      net += r.net;
      if (r.net > 0) grossWins += r.net;
      else grossLosses += r.net;
      if (!best || r.net > best.net) best = { playerId: r.playerId, net: r.net };
      if (!worst || r.net < worst.net) worst = { playerId: r.playerId, net: r.net };
    }
    running += net;
    peak = Math.max(peak, running);
    drawdown = Math.min(drawdown, running - peak);
    const side = s.session.highLimit ? high : other;
    side.net += net;
    side.sessions += 1;
    const result = teamResult(s);
    if (result === "mixed") {
      record.mixed += 1;
      current = null;
      continue;
    }
    if (result === "win") record.wins += 1;
    else record.losses += 1;
    current =
      current?.result === result ? { result, length: current.length + 1 } : { result, length: 1 };
    if (result === "win") longestWin = Math.max(longestWin, current.length);
    else longestLoss = Math.max(longestLoss, current.length);
  }
  return {
    sessions: ordered.length,
    net: running,
    grossWins,
    grossLosses,
    record,
    winRate: ordered.length === 0 ? 0 : record.wins / ordered.length,
    average: ordered.length === 0 ? 0 : running / ordered.length,
    best,
    worst,
    drawdown,
    team: { current, longestWin, longestLoss },
    highLimit: high,
    otherTables: other,
  };
};

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
 */
export const tripRoute = <S extends TripSession & { readonly venue: { readonly id: VenueId } }>(
  sessions: ReadonlyArray<S>,
) => {
  const stops = new Map<
    VenueId,
    { venue: S["venue"]; number: number; visits: number; net: number }
  >();
  const path: Array<S["venue"]> = [];
  for (const s of sessions.toSorted((a, b) => startOf(a) - startOf(b))) {
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
  return { stops: [...stops.values()] as ReadonlyArray<RouteStop<S["venue"]>>, path };
};
