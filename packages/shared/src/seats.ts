import type { Entry, Game, PlayerId, Seating, Session, SessionId } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";

import { playerResults, type PlayerResult } from "./results.ts";

/** The games played from numbered seats: the table sizes they come in, and the usual one. */
export const tableSizes: Partial<
  Record<Game, { readonly sizes: ReadonlyArray<number>; readonly usual: number }>
> = { blackjack: { sizes: [5, 6, 7], usual: 7 } };

/** How many seats a session's table has, or null for a game that isn't played from seats. */
export const seatCount = (session: Pick<Session, "game" | "tableSeats">) =>
  tableSizes[session.game] ? (session.tableSeats ?? tableSizes[session.game]!.usual) : null;

type Sat = Pick<Seating, "playerId" | "seat" | "occurredAt">;

/** Where each player sits now, from a session's seatings oldest first. */
export const seatsNow = (seatings: ReadonlyArray<Sat>): ReadonlyMap<PlayerId, number> => {
  const now = new Map<PlayerId, number>();
  for (const { playerId, seat } of seatings)
    if (seat === null) now.delete(playerId);
    else now.set(playerId, seat);
  return now;
};

/**
 * The seat each player held longest up to `endedAt`, which is where stats credit their result:
 * moving seats for luck doesn't rewrite where the session was mostly played. A tie goes to the
 * seat taken first.
 */
export const mainSeats = (
  seatings: ReadonlyArray<Sat>,
  endedAt: DateTime.Utc,
): ReadonlyMap<PlayerId, number> => {
  const held = new Map<PlayerId, Map<number, number>>();
  const sitting = new Map<PlayerId, { readonly seat: number; readonly since: number }>();
  const leave = (playerId: PlayerId, until: number) => {
    const current = sitting.get(playerId);
    if (!current) return;
    const seats = held.get(playerId)!;
    seats.set(current.seat, seats.get(current.seat)! + Math.max(0, until - current.since));
    sitting.delete(playerId);
  };
  for (const { playerId, seat, occurredAt } of seatings) {
    const at = DateTime.toEpochMillis(occurredAt);
    leave(playerId, at);
    if (seat === null) continue;
    sitting.set(playerId, { seat, since: at });
    const seats = held.get(playerId) ?? new Map<number, number>();
    if (!seats.has(seat)) seats.set(seat, 0);
    held.set(playerId, seats);
  }
  for (const playerId of sitting.keys()) leave(playerId, DateTime.toEpochMillis(endedAt));
  return new Map(
    Array.from(held, ([playerId, seats]) => {
      let best = [...seats][0]!;
      for (const entry of seats) if (entry[1] > best[1]) best = entry;
      return [playerId, best[0]];
    }),
  );
};

/**
 * Results by seat: each player's result in each session goes to the seat they held longest there.
 * `sessions` counts the sessions someone played mostly from that seat. Sessions nobody sat in
 * don't count.
 */
export const resultsBySeat = (
  sessions: ReadonlyArray<Pick<Session, "id" | "endedAt">>,
  seatings: ReadonlyArray<Sat & Pick<Seating, "sessionId">>,
  entries: ReadonlyArray<Pick<Entry, "kind" | "playerId" | "amount" | "voidedAt" | "sessionId">>,
): ReadonlyMap<
  number,
  { readonly sessions: number; readonly results: ReadonlyMap<PlayerId, PlayerResult> }
> => {
  const main = new Map<SessionId, ReadonlyMap<PlayerId, number>>();
  for (const session of sessions) {
    const sat = seatings.filter((s) => s.sessionId === session.id);
    if (sat.length > 0 && session.endedAt) main.set(session.id, mainSeats(sat, session.endedAt));
  }
  const bySeat = new Map<
    number,
    { sessions: Set<SessionId>; entries: Array<(typeof entries)[number]> }
  >();
  for (const entry of entries) {
    const seat =
      entry.sessionId === null ? undefined : main.get(entry.sessionId)?.get(entry.playerId);
    if (seat === undefined) continue;
    const group = bySeat.get(seat) ?? { sessions: new Set(), entries: [] };
    group.sessions.add(entry.sessionId!);
    group.entries.push(entry);
    bySeat.set(seat, group);
  }
  return new Map(
    Array.from(bySeat, ([seat, group]) => [
      seat,
      { sessions: group.sessions.size, results: playerResults(group.entries) },
    ]),
  );
};
