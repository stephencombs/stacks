import * as DateTime from "effect/DateTime";
import {
  MinorUnits,
  TripId,
  type CurrencyCode,
  type GroupDetail,
  type GroupListItem,
  type PlayerId,
  type Trip,
} from "@stacks/contracts";
import { formatMoney } from "@stacks/shared/money";
import type {
  AwardKey,
  PlayerTrip,
  TripAward,
  TripStanding,
  TripClock,
  TripNight,
  TripSession,
} from "@stacks/shared/trips";

import { formatTime } from "./format.ts";

const HOUR = 3_600_000;
/** A night runs until 6am, so the 2am session still counts as the night before. */
const NIGHT_ENDS = 6;

const pad = (n: number) => String(n).padStart(2, "0");
const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** The trip board's clock in the viewer's own time zone. */
export const localClock: TripClock = {
  night: (at) => {
    const date = new Date(DateTime.toEpochMillis(at) - NIGHT_ENDS * HOUR);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  },
  hour: (at) => new Date(DateTime.toEpochMillis(at)).getHours(),
};

/** "Day 3 · Friday", for the night the board is on. */
export const nightLabel = (night: TripNight<TripSession>) => {
  const first = night.sessions[0]!;
  const date = new Date(DateTime.toEpochMillis(first.session.startedAt) - NIGHT_ENDS * HOUR);
  return `Day ${night.number} · ${weekday.format(date)}`;
};

/** "Oct 21 – Oct 25", or "Since Oct 21" while the trip is going. */
export const tripDates = (trip: Trip) => {
  const from = shortDate.format(DateTime.toDateUtc(trip.startedAt));
  return trip.endedAt === null
    ? `Since ${from}`
    : `${from} – ${shortDate.format(DateTime.toDateUtc(trip.endedAt))}`;
};

/** Money the way the board shows it: always signed, cents only when there are some. */
export const boardMoney = (amount: number, currency: CurrencyCode, signed = true) =>
  formatMoney(MinorUnits.make(amount), currency, {
    signDisplay: signed ? "exceptZero" : "auto",
    trailingZeroDisplay: "stripIfInteger",
  });

export const awardTitles: Record<AwardKey, string> = {
  biggest_hit: "Biggest hit",
  heater: "Heater",
  comeback: "Comeback kid",
  hopper: "Casino hopper",
  whale: "Whale",
  night_owl: "Night owl",
  rough_night: "Rough night",
};

/** What earned an award, as a short line under the winner's name. */
export const awardLine = (
  award: TripAward<TripSession & { readonly venue: { readonly name: string } }>,
  currency: CurrencyCode,
) => {
  const where = award.session ? ` at ${award.session.venue.name}` : "";
  switch (award.key) {
    case "biggest_hit":
      return `${boardMoney(award.value, currency)}${where}`;
    case "rough_night":
      return `${boardMoney(-award.value, currency)}${where}`;
    case "heater":
      return `${award.value} winning sessions in a row`;
    case "comeback":
      return `Climbed ${boardMoney(award.value, currency, false)} from their low`;
    case "hopper":
      return `Played ${award.value} different casinos`;
    case "whale":
      return `Bought in ${boardMoney(award.value, currency, false)} in one session`;
    case "night_owl":
      return `Sat down at ${award.session ? formatTime(award.session.session.startedAt) : `${award.value}:00`}`;
  }
};

/** Chip colors go to players in the order they joined, 1 to 8, then around again. */
export const chipOf = (detail: GroupDetail, playerId: PlayerId) => {
  const index = detail.players.findIndex((player) => player.id === playerId);
  return ((index === -1 ? 0 : index) % 8) + 1;
};

/** A run of results in words, once it's at least two long: "3 wins in a row". */
export const streakLine = (streak: { readonly length: number; readonly winning: boolean }) =>
  streak.length < 2 ? null : `${streak.length} ${streak.winning ? "wins" : "losses"} in a row`;

/** "1st", "2nd", "3rd", "11th": a place on the board. */
export const ordinal = (n: number) => {
  const rank = Math.abs(n);
  const lastTwo = rank % 100;
  const suffix =
    lastTwo >= 11 && lastTwo <= 13 ? "th" : (["th", "st", "nd", "rd"][rank % 10] ?? "th");
  return `${n}${suffix}`;
};

/** The lines under a player's trip total: how far they climbed, and how often they won. */
export const tripLines = (trip: PlayerTrip<unknown>, currency: CurrencyCode) => ({
  climb:
    trip.low < 0 && trip.net > trip.low
      ? `Up ${boardMoney(trip.net - trip.low, currency, false)} from your low`
      : null,
  winRate: trip.played === 0 ? "–" : `${Math.round((trip.won / trip.played) * 100)}%`,
});

/** The words over your balance on settle up, and the line under it. The figure is the amount without its sign. */
export const balanceHeadline = (balance: number, payments: number) => ({
  label: balance > 0 ? "You're owed" : balance < 0 ? "You owe" : "You're square",
  tone: balance > 0 ? ("win" as const) : balance < 0 ? ("loss" as const) : ("accent" as const),
  line:
    payments === 0
      ? null
      : payments === 1
        ? "One payment squares you up"
        : `${payments} payments square you up`,
});

/**
 * Where you stand on the board, led by the gap that matters: to the player just ahead, or when
 * you lead, to the one just behind. With no gap to show (tied, or alone on the board) the figure
 * falls back to your trip result.
 */
export const raceHeadline = (
  standings: ReadonlyArray<Pick<TripStanding, "playerId" | "net" | "rank">>,
  me: PlayerId,
  names: ReadonlyMap<PlayerId, string>,
  currency: CurrencyCode,
) => {
  const order = standings.toSorted((a, b) => a.rank - b.rank);
  const mine = order.find((s) => s.playerId === me);
  if (!mine) return null;
  const name = (playerId: PlayerId) => names.get(playerId) ?? "Someone";
  const place = `${ordinal(mine.rank)} of ${order.length} · ${boardMoney(mine.net, currency)} for the trip`;
  const tied = order.find((s) => s.playerId !== me && s.net === mine.net);
  const above = order.findLast((s) => s.net > mine.net);
  const below = order.find((s) => s.net < mine.net);
  if (tied)
    return {
      label:
        mine.rank === 1
          ? `Tied for the lead with ${name(tied.playerId)}`
          : `Tied with ${name(tied.playerId)}`,
      gap: null,
      net: mine.net,
      tone: "accent" as const,
      line: place,
    };
  if (above)
    return {
      label: `Behind ${name(above.playerId)}`,
      gap: above.net - mine.net,
      net: mine.net,
      tone: "loss" as const,
      line: place,
    };
  if (below)
    return {
      label: `Ahead of ${name(below.playerId)}`,
      gap: mine.net - below.net,
      net: mine.net,
      tone: "win" as const,
      line: place,
    };
  return { label: "You lead", gap: null, net: mine.net, tone: "accent" as const, line: null };
};

const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
  signDisplay: "exceptZero",
});

/** A return on buy-ins, "+55%" or "-30%", or "–" for someone who never put money in. */
export const returnLabel = (value: number | null) =>
  value === null ? "–" : percent.format(value).replace("−", "-");

/** A night's or a trip's record: "4W · 3L · 1 even", leaving out what's zero. */
export const recordLine = (wins: number, losses: number, even: number) =>
  [wins ? `${wins}W` : null, losses ? `${losses}L` : null, even ? `${even} even` : null]
    .filter((part) => part !== null)
    .join(" · ");

export type LastTripStorage = {
  readonly load: () => string | null;
  readonly save: (tripId: string | null) => void;
};

export const makeLastTripStore = (storage: LastTripStorage) => {
  const listeners = new Set<() => void>();
  const initial = storage.load();
  let current = initial ? TripId.make(initial) : null;
  return {
    get: () => current,
    set: (next: TripId | null) => {
      if (next === current) return;
      current = next;
      storage.save(next);
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export const resolveEntry = (
  groups: ReadonlyArray<Pick<GroupListItem, "group" | "trips">>,
  lastTripId: TripId | null,
) => {
  if (lastTripId !== null) {
    const exists = groups.some((item) => item.trips.some((trip) => trip.id === lastTripId));
    if (exists) return { kind: "trip" as const, tripId: lastTripId };
  }
  const going = groups
    .flatMap((item) =>
      item.trips
        .filter((trip) => trip.endedAt === null)
        .map((trip) => ({ group: item.group, trip })),
    )
    .toSorted(
      (a, b) => DateTime.toEpochMillis(b.trip.startedAt) - DateTime.toEpochMillis(a.trip.startedAt),
    );
  if (going.length === 1) return { kind: "trip" as const, tripId: going[0]!.trip.id };
  if (going.length > 1) return { kind: "choose" as const, trips: going };
  return { kind: "groups" as const };
};

/**
 * The trip a group's pages put in scope: the one already in scope if it belongs to this group,
 * else the newest one still going, else the newest. Trips arrive newest first.
 */
export const tripInScope = <T extends Pick<Trip, "id" | "endedAt">>(
  trips: ReadonlyArray<T>,
  current: TripId | null,
): T | undefined =>
  trips.find((trip) => trip.id === current) ??
  trips.find((trip) => trip.endedAt === null) ??
  trips[0];

/** The scope sheet's order: trips still going, then ended ones, each newest first. */
export const scopeTrips = <T extends Pick<Trip, "endedAt">>(trips: ReadonlyArray<T>) => [
  ...trips.filter((trip) => trip.endedAt === null),
  ...trips.filter((trip) => trip.endedAt !== null),
];

export const unsettledAmount = (
  detail: Pick<GroupDetail, "unsettled">,
  tripId: TripId,
): MinorUnits | null => detail.unsettled.find((item) => item.tripId === tripId)?.amount ?? null;
