import * as DateTime from "effect/DateTime";
import type { GroupDetail, PlayerId } from "@stacks/contracts";

const day = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});
const dayWithYear = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export const formatDay = (value: DateTime.Utc) => {
  const date = DateTime.toDateUtc(value);
  return date.getFullYear() === new Date().getFullYear()
    ? day.format(date)
    : dayWithYear.format(date);
};

export const formatTime = (value: DateTime.Utc) => time.format(DateTime.toDateUtc(value));

export const formatDuration = (start: DateTime.Utc, end: DateTime.Utc) => {
  const millis = DateTime.toEpochMillis(end) - DateTime.toEpochMillis(start);
  const minutes = Math.max(0, Math.round(millis / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours === 0 ? `${minutes}m` : `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
};

export const gameNames = {
  slots: "Slots",
  blackjack: "Blackjack",
  roulette: "Roulette",
  craps: "Craps",
  baccarat: "Baccarat",
  poker_cash: "Poker (cash)",
  poker_tourney: "Poker tournament",
  other: "Other",
} as const;

export const playerNames = (detail: GroupDetail) =>
  new Map<PlayerId, string>(detail.players.map((player) => [player.id, player.displayName]));

/** Admins and the owner manage people, reopen sessions and void anyone's entries. */
export const isAdmin = (detail: GroupDetail) => detail.role !== "member";

/** "The group has played 29 sessions over 135 hours." Hours keep one decimal. */
export const playedSummary = (sessionCount: number, minutesPlayed: number) => {
  const hours = Math.round(minutesPlayed / 6) / 10;
  return `The group has played ${sessionCount} ${sessionCount === 1 ? "session" : "sessions"} over ${hours} ${hours === 1 ? "hour" : "hours"}.`;
};
