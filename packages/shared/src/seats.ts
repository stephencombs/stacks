import type { Game, PlayerId, Seating, Session } from "@stacks/contracts";

/** The games played from numbered seats: the table sizes they come in, and the usual one. */
export const tableSizes: Partial<
  Record<Game, { readonly sizes: ReadonlyArray<number>; readonly usual: number }>
> = { blackjack: { sizes: [5, 6, 7], usual: 5 } };

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
