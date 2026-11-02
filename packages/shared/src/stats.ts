import type { PlayerId } from "@stacks/contracts";

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

/**
 * Everyone's place after each session, 0 for the lead, for the players given in their starting
 * order. A tie keeps the order from the session before, so a line only moves when it passes
 * someone.
 */
export const racePlaces = (
  sessions: ReadonlyArray<StatsSession>,
  players: ReadonlyArray<PlayerId>,
): ReadonlyArray<ReadonlyMap<PlayerId, number>> => {
  const totals = new Map(players.map((playerId) => [playerId, 0]));
  let order = [...players];
  return sessions.map((session) => {
    for (const result of session.results)
      if (totals.has(result.playerId))
        totals.set(result.playerId, totals.get(result.playerId)! + result.net);
    order = order.toSorted((a, b) => totals.get(b)! - totals.get(a)!);
    return new Map(order.map((playerId, place) => [playerId, place]));
  });
};

/** A player's total after each session, carried through the ones they sat out. */
export const runningTotals = (sessions: ReadonlyArray<StatsSession>, playerId: PlayerId) => {
  let total = 0;
  return sessions.map((session) => {
    total += session.results.find((result) => result.playerId === playerId)?.net ?? 0;
    return total;
  });
};

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
