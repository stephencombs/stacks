import {
  type Game,
  type PlayerId,
  type Seat,
  type Seating,
  type Visit,
  type VisitId,
  type VisitSeating,
} from "@stacks/contracts";
import * as DateTime from "effect/DateTime";

/** The games played from numbered seats: the table sizes they come in, and the usual one. */
export const tableSizes: Partial<
  Record<Game, { readonly sizes: ReadonlyArray<number>; readonly usual: number }>
> = { blackjack: { sizes: [5, 6, 7], usual: 5 } };

/** How many seats a session or table has, or null for a game that isn't played from seats. */
export const seatCount = (table: {
  readonly game: Game | null;
  readonly tableSeats?: number | null;
}) =>
  table.game !== null && tableSizes[table.game]
    ? (table.tableSeats ?? tableSizes[table.game]!.usual)
    : null;

/** Normalizes a table seat count for `game`, rejecting invalid counts for seated games. */
export const normalizeTableSeats = (game: Game | null, tableSeats: number | null | undefined) => {
  if (game === null || !tableSizes[game] || tableSeats === null || tableSeats === undefined)
    return null;

  if (!tableSizes[game]!.sizes.includes(tableSeats))
    throw new RangeError(`Choose ${tableSizes[game]!.sizes.join(", ")} seats for ${game}.`);

  return tableSeats;
};

const ms = DateTime.toEpochMillis;

const byOrder = (
  a: Pick<VisitSeating, "id" | "occurredAt" | "createdAt">,
  b: Pick<VisitSeating, "id" | "occurredAt" | "createdAt">,
) =>
  ms(a.occurredAt) - ms(b.occurredAt) ||
  ms(a.createdAt) - ms(b.createdAt) ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Chronological order for visit seatings: occurred time, creation time, then ID. */
export const sortSeatings = <T extends Pick<VisitSeating, "id" | "occurredAt" | "createdAt">>(
  seatings: ReadonlyArray<T>,
) => seatings.toSorted(byOrder);

/** The seat a visit currently holds, or null if unseated or standing. */
export const visitSeatNow = (
  seatings: ReadonlyArray<
    Pick<VisitSeating, "id" | "seat" | "occurredAt" | "createdAt" | "voidedAt">
  >,
) => sortSeatings(seatings.filter((seating) => seating.voidedAt === null)).at(-1)?.seat ?? null;

/**
 * Currently occupied seats across live, non-deleted visits at a table. If reopened or restored
 * visits overlap on a seat, the latest active seating timestamp wins deterministically.
 */
export const tableLiveSeats = (
  visits: ReadonlyArray<Pick<Visit, "id" | "finishedAt" | "deletedAt">>,
  seatings: ReadonlyArray<
    Pick<VisitSeating, "id" | "visitId" | "seat" | "occurredAt" | "createdAt" | "voidedAt">
  >,
) => {
  const live = new Set(
    visits.flatMap((visit) =>
      visit.finishedAt === null && visit.deletedAt === undefined ? [visit.id] : [],
    ),
  );

  const byVisit = Map.groupBy(
    seatings.filter((seating) => seating.voidedAt === null && live.has(seating.visitId)),
    (seating) => seating.visitId,
  );

  const active = Array.from(byVisit.values())
    .map((rows) => sortSeatings(rows).at(-1)!)
    .filter((row) => row.seat !== null);

  const occupied = new Map<number, VisitId>();

  for (const row of sortSeatings(active)) occupied.set(row.seat!, row.visitId);

  return occupied;
};

export type VisitSeatOutcome =
  | { readonly kind: "none" }
  | { readonly kind: "seat"; readonly seat: number }
  | { readonly kind: "multiple"; readonly seats: ReadonlyArray<number> };

/**
 * Classifies a visit's standing seatings for stats: single seat only when every seated record is
 * that seat and the player didn't end standing; multiple when two or more distinct seats appear.
 */
export const visitSeatOutcome = (
  seatings: ReadonlyArray<
    Pick<VisitSeating, "id" | "seat" | "occurredAt" | "createdAt" | "voidedAt">
  >,
) => {
  const standing = sortSeatings(seatings.filter((seating) => seating.voidedAt === null));

  if (standing.length === 0) return { kind: "none" } satisfies VisitSeatOutcome;

  const distinct: Array<number> = [];

  for (const row of standing)
    if (row.seat !== null && !distinct.includes(row.seat)) distinct.push(row.seat);

  if (distinct.length >= 2) return { kind: "multiple", seats: distinct } satisfies VisitSeatOutcome;

  if (distinct.length === 0 || standing.at(-1)!.seat === null)
    return { kind: "none" } satisfies VisitSeatOutcome;

  return { kind: "seat", seat: distinct[0]! } satisfies VisitSeatOutcome;
};

/** How a finished blackjack visit counts in seat stats: one seat (`1..N`) or `"multiple"`. */
export type SeatBucket = Seat | "multiple";

/** Maps a visit's seat outcome to its stats bucket, or null when unseated. */
export const seatBucketOf = (outcome: VisitSeatOutcome) => {
  if (outcome.kind === "seat") return outcome.seat;

  if (outcome.kind === "multiple") return "multiple" as const;

  return null;
};

type Sat = Pick<Seating, "playerId" | "seat" | "occurredAt">;

/** Where each player sits now, from a session's seatings oldest first. */
export const seatsNow = (seatings: ReadonlyArray<Sat>) => {
  const now = new Map<PlayerId, number>();

  for (const { playerId, seat } of seatings)
    if (seat === null) now.delete(playerId);
    else now.set(playerId, seat);

  return now;
};
