import * as DateTime from "effect/DateTime";
import {
  MinorUnits,
  type CurrencyCode,
  type GroupDetail,
  type PlayerId,
  type Trip,
} from "@stacks/contracts";
import { formatMoney } from "@stacks/shared/money";
import type { AwardKey, TripAward, TripClock, TripNight, TripSession } from "@stacks/shared/trips";

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

/** A night's or a trip's record: "4W · 3L · 1 even", leaving out what's zero. */
export const recordLine = (wins: number, losses: number, even: number) =>
  [wins ? `${wins}W` : null, losses ? `${losses}L` : null, even ? `${even} even` : null]
    .filter((part) => part !== null)
    .join(" · ");
