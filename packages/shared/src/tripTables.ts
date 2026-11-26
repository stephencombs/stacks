import {
  MinorUnits,
  type PlayEntry,
  type PlayerId,
  type Visit,
  type VisitSeating,
} from "@stacks/contracts";
import * as DateTime from "effect/DateTime";

import { type VisitFunding } from "./funding.ts";
import { playerResults, type PlayerResult } from "./results.ts";
import { seatBucketOf, visitSeatOutcome, type SeatBucket } from "./seats.ts";

export type TableVisit = Pick<Visit, "id" | "playerId" | "startedAt" | "finishedAt"> & {
  readonly deletedAt?: DateTime.Utc | null | undefined;
};

export type TableEntry = Pick<PlayEntry, "visitId" | "kind" | "amount" | "voidedAt"> & {
  readonly counterpartyId?: PlayerId | null | undefined;
};

export type TableSeating = Pick<
  VisitSeating,
  "id" | "visitId" | "seat" | "seats" | "occurredAt" | "createdAt" | "voidedAt"
>;

export type VisitSeatPlay = {
  readonly playerId: PlayerId;
  readonly seat: SeatBucket;
  readonly net: MinorUnits;
  readonly milliseconds: number;
};

export interface GroupTable {
  readonly startedAt: DateTime.Utc;
  /** When the last player cashed out; null while anyone is still playing. */
  readonly endedAt: DateTime.Utc | null;
  /** Time anyone was playing, over finished visits: overlapping visits count once. */
  readonly minutesPlayed: number;
  /** Each seated member's own time playing, over their finished visits, counted once. */
  readonly memberMinutes: ReadonlyArray<{ readonly playerId: PlayerId; readonly minutes: number }>;
  /** Each seated member's own time playing in milliseconds, over their finished visits, counted once. */
  readonly memberMilliseconds: ReadonlyArray<{
    readonly playerId: PlayerId;
    readonly milliseconds: number;
  }>;
  /** Each group member at the table, in the order they first sat down. */
  readonly seated: ReadonlyArray<PlayerId>;
  /** Members' settled results: their finished visits only, so a return visit can't undo them. */
  readonly results: ReadonlyArray<PlayerResult & { readonly playerId: PlayerId }>;
  /** Members playing now, with what their open visit has bought in for. */
  readonly inPlay: ReadonlyArray<{ readonly playerId: PlayerId; readonly buyIn: MinorUnits }>;
  /** Table players whose play counts for no member, with their settled results. */
  readonly others: ReadonlyArray<
    PlayerResult & { readonly playerId: PlayerId; readonly playing: boolean }
  >;
  /** Each finished visit that counts for a member and has an entry, for funding stats. */
  readonly visits: ReadonlyArray<VisitFunding>;
  /** Each finished member visit with a settled seat bucket, keeping return visits separate. */
  readonly seatVisits: ReadonlyArray<VisitSeatPlay>;
}

const none = MinorUnits.make(0);
const ZERO: PlayerResult = { buyIn: none, cashOut: none, adjustment: none, net: none };

const millis = DateTime.toEpochMillis;

const covered = (intervals: ReadonlyArray<readonly [number, number]>) => {
  let total = 0;
  let end = -Infinity;

  for (const [from, to] of intervals.toSorted((a, b) => a[0] - b[0])) {
    if (to <= end) continue;
    total += to - Math.max(from, end);
    end = to;
  }

  return total;
};

/**
 * A table as its trip's group sees it. `memberOf` names the group member a visit counts for, or
 * null when it counts for no one. It takes the visit, not the player, because a link can hold for
 * some of a player's visits and not others. Deleted visits don't count; null if nothing's left.
 * `payerOf` names the member a buy-in's counterparty counts for at a visit, or null for no one.
 */
export const groupTable = (
  visits: Iterable<TableVisit>,
  entries: Iterable<TableEntry>,
  memberOf: (visit: TableVisit) => PlayerId | null,
  payerOf: (counterpartyId: PlayerId, visit: TableVisit) => PlayerId | null = () => null,
  seatings: Iterable<TableSeating> = [],
) => {
  const shown = Array.from(visits)
    .filter((visit) => (visit.deletedAt ?? null) === null)
    .toSorted(
      (a, b) =>
        millis(a.startedAt) - millis(b.startedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );

  if (shown.length === 0) return null;

  const byVisit = new Map(
    shown.map((visit) => {
      const member = memberOf(visit);

      return [visit.id, { visit, member, owner: member ?? visit.playerId }] as const;
    }),
  );

  const counted = Array.from(entries).flatMap((entry) => {
    const at = byVisit.get(entry.visitId);

    return at && entry.voidedAt === null ? [{ ...entry, ...at }] : [];
  });

  const seatingsByVisit = Map.groupBy(Array.from(seatings), (seating) => seating.visitId);

  const settled = (members: boolean) =>
    playerResults(
      counted.flatMap((entry) =>
        entry.visit.finishedAt !== null && (entry.member !== null) === members
          ? [{ ...entry, playerId: entry.owner }]
          : [],
      ),
    );

  const memberResults = settled(true);
  const otherResults = settled(false);

  const seated = new Set<PlayerId>();
  const inPlay = new Map<PlayerId, number>();
  const others = new Map<PlayerId, boolean>();

  for (const { visit, member } of byVisit.values()) {
    const open = visit.finishedAt === null;

    if (member === null) others.set(visit.playerId, (others.get(visit.playerId) ?? false) || open);
    else {
      seated.add(member);

      if (open) inPlay.set(member, inPlay.get(member) ?? 0);
    }
  }

  for (const entry of counted)
    if (entry.member !== null && entry.visit.finishedAt === null && entry.kind === "buy_in")
      inPlay.set(entry.member, (inPlay.get(entry.member) ?? 0) + entry.amount);

  const span = (visit: TableVisit) =>
    visit.finishedAt === null ? [] : [[millis(visit.startedAt), millis(visit.finishedAt)] as const];

  const finished = shown.flatMap(span);

  const minutes = (intervals: ReadonlyArray<readonly [number, number]>) =>
    Math.round(covered(intervals) / 60_000);

  const memberMilliseconds = Array.from(seated, (playerId) => ({
    playerId,
    milliseconds: covered(
      Array.from(byVisit.values()).flatMap(({ visit, member }) =>
        member === playerId ? span(visit) : [],
      ),
    ),
  }));

  return {
    startedAt: shown[0]!.startedAt,
    endedAt:
      finished.length < shown.length
        ? null
        : DateTime.makeUnsafe(Math.max(...finished.map(([, to]) => to))),
    minutesPlayed: minutes(finished),
    memberMinutes: memberMilliseconds.map(({ playerId, milliseconds }) => ({
      playerId,
      minutes: Math.round(milliseconds / 60_000),
    })),
    memberMilliseconds,
    seated: Array.from(seated),
    results: Array.from(seated).flatMap((playerId) => {
      const result = memberResults.get(playerId);

      return result ? [{ playerId, ...result }] : [];
    }),
    inPlay: Array.from(inPlay, ([playerId, buyIn]) => ({
      playerId,
      buyIn: MinorUnits.make(buyIn),
    })),
    visits: shown.flatMap((visit) => {
      const { member } = byVisit.get(visit.id)!;
      const own = counted.filter((entry) => entry.visit.id === visit.id);

      if (member === null || visit.finishedAt === null || own.length === 0) return [];

      const buyIns = own.filter((entry) => entry.kind === "buy_in");

      return [
        {
          playerId: member,
          buyIns: buyIns.length,
          net: own.reduce(
            (sum, entry) => sum + (entry.kind === "buy_in" ? -entry.amount : entry.amount),
            0,
          ),
          covered: buyIns.flatMap((entry) => {
            const payer =
              entry.counterpartyId == null ? null : payerOf(entry.counterpartyId, visit);

            return payer === null || payer === member
              ? []
              : [{ payerId: payer, amount: entry.amount }];
          }),
        },
      ];
    }),
    seatVisits: shown.flatMap((visit) => {
      const { member } = byVisit.get(visit.id)!;
      const own = counted.filter((entry) => entry.visit.id === visit.id);

      if (member === null || visit.finishedAt === null || own.length === 0) return [];

      const seat = seatBucketOf(visitSeatOutcome(seatingsByVisit.get(visit.id) ?? []));

      if (seat === null) return [];

      return [
        {
          playerId: member,
          seat,
          net: MinorUnits.make(
            own.reduce(
              (sum, entry) => sum + (entry.kind === "buy_in" ? -entry.amount : entry.amount),
              0,
            ),
          ),
          milliseconds: Math.max(0, millis(visit.finishedAt) - millis(visit.startedAt)),
        },
      ];
    }),
    others: Array.from(others, ([playerId, playing]) => ({
      playerId,
      playing,
      ...(otherResults.get(playerId) ?? ZERO),
    })),
  };
};

/** When a member was out of the group. `leftAt` is null while they're in it now. */
export interface MembershipSpan {
  readonly leftAt: DateTime.Utc | null;
  /** Earlier times they left and came back. */
  readonly absences: ReadonlyArray<{
    readonly leftAt: DateTime.Utc;
    readonly returnedAt: DateTime.Utc;
  }>;
}

/**
 * Whether play that started at `at` counts for a member: not while they were out of the group.
 * Play before they first joined counts, since it was in the group's trip.
 */
export const inGroupAt = (at: DateTime.Utc, membership: MembershipSpan) =>
  (membership.leftAt === null || DateTime.isLessThan(at, membership.leftAt)) &&
  !membership.absences.some(
    (absence) =>
      !DateTime.isLessThan(at, absence.leftAt) && DateTime.isLessThan(at, absence.returnedAt),
  );
