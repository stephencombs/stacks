import * as DateTime from "effect/DateTime";
import {
  MinorUnits,
  type GroupDetail,
  type Player,
  type PlayerId,
  type StakeView,
  type UserId,
} from "@stacks/contracts";
import { formatMoney } from "@stacks/shared/money";

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

export const formatTime = (value: DateTime.Utc, timeZone?: DateTime.TimeZone) =>
  timeZone === undefined
    ? time.format(DateTime.toDateUtc(value))
    : DateTime.format(DateTime.setZone(value, timeZone), { hour: "numeric", minute: "2-digit" });

export const formatDuration = (start: DateTime.Utc, end: DateTime.Utc) => {
  const millis = DateTime.toEpochMillis(end) - DateTime.toEpochMillis(start);
  const minutes = Math.max(0, Math.round(millis / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours === 0 ? `${minutes}m` : `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
};

/** Time played in a header: "45m" under an hour, then whole hours, "4h". */
export const formatPlayed = (minutes: number) =>
  minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`;

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

/**
 * Names for people listed together, with a repeated name numbered after its first ("Priya",
 * "Priya 2") so two of them can be told apart. Same order in, same order out.
 */
export const tellApart = (names: ReadonlyArray<string>) => {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const trimmed = name.trim();
    const key = trimmed.toLowerCase();
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return count === 1 ? name : `${trimmed} ${count}`;
  });
};

export const distinctPlayerNames = (entries: Iterable<readonly [PlayerId, string]>) => {
  const players = new Map(entries);
  const names = tellApart([...players.values()]);
  return new Map([...players.keys()].map((id, index) => [id, names[index]!]));
};

/** A name where it shares a line with an amount or a title: long ones end in an ellipsis. */
export const shortName = (name: string, max = 16) =>
  name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;

export const isGuest = (player: Player) => player.claimCode !== null;

export const isFormerMember = (player: Player) => player.role === null && player.claimCode === null;

export const csvFilename = (groupName: string) => {
  const slug = groupName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "stacks"}-ledger.csv`;
};

/** Admins and the owner manage people, reopen sessions and void anyone's entries. */
export const isAdmin = (detail: GroupDetail) => detail.role !== "member";

/** "The group has played 29 sessions over 135 hours." Hours keep one decimal. */
export const playedSummary = (sessionCount: number, minutesPlayed: number) => {
  const hours = Math.round(minutesPlayed / 6) / 10;
  const played = `The group has played ${sessionCount} ${sessionCount === 1 ? "session" : "sessions"}`;
  return hours === 0 ? `${played}.` : `${played} over ${hours} ${hours === 1 ? "hour" : "hours"}.`;
};

/**
 * Two lines for a stake: who backed whom on what terms, then where it stands, as in
 * "Nick is up $400.00 · owes back $1,200.00".
 */
export const stakeLines = (
  { stake, result, owed }: StakeView,
  names: ReadonlyMap<PlayerId, string>,
  currency: GroupDetail["group"]["currency"],
) => {
  const money = (amount: number) => formatMoney(MinorUnits.make(Math.abs(amount)), currency);
  const borrower = names.get(stake.borrowerId) ?? "Player";
  const title = `${names.get(stake.lenderId) ?? "Player"} backed ${borrower} ${money(stake.amount)} · ${stake.lenderShare}% of winnings`;
  if (stake.voidedAt !== null) {
    return { title, status: `Voided${stake.voidReason ? `: ${stake.voidReason}` : ""}` };
  }
  const ended = stake.endedAt !== null;
  const standing =
    result === 0
      ? `${borrower} ${ended ? "broke" : "is"} even`
      : `${borrower} ${ended ? "was" : "is"} ${result > 0 ? "up" : "down"} ${money(result)}`;
  const parts = [
    ended ? `Ended ${formatDay(stake.endedAt!)}` : null,
    standing,
    `owes back ${money(owed)}`,
  ];
  return { title, status: parts.filter(Boolean).join(" · ") };
};

/** The backer, the player, whoever added a stake or an admin can end, reopen or void it. */
export const canChangeStake = (detail: GroupDetail, { stake }: StakeView, userId: UserId | null) =>
  isAdmin(detail) ||
  stake.createdBy === userId ||
  stake.lenderId === detail.myPlayerId ||
  stake.borrowerId === detail.myPlayerId;

/** Where something was played, or that no casino was set. */
export const venueLabel = (venue: { readonly name: string } | null) =>
  venue?.name ?? "No casino set";
