import * as DateTime from "effect/DateTime";
import type { PlayerId, PlayerResult, SessionId, VenueId } from "@stacks/contracts";

import { sessionRuns } from "./results.ts";

/** The parts of a closed session the trip board reads. */
export interface TripSession {
  readonly session: { readonly id: SessionId; readonly startedAt: DateTime.Utc };
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
    };
  });
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
