import { MinorUnits, type PlayerId, type TableView, type VisitId } from "@stacks/contracts";
import { formatMoney } from "@stacks/shared/money";
import * as DateTime from "effect/DateTime";

import { distinctPlayerNames, formatTime } from "./format.ts";
import { RECORDING_CURRENCY, type RecordingTableView } from "./recordingView.ts";

/** One player's visit at the table, as the live screen lists it. */
export type TableSeat = {
  readonly visitId: VisitId;
  readonly playerId: PlayerId;
  /** "You" for this device's player. */
  readonly name: string;
  readonly isSelf: boolean;
  readonly playing: boolean;
  /** "Playing", "Playing · sat down 10:05 PM", or "Cashed out 10:52 PM · $200.00 in". */
  readonly status: string;
  /** What they've bought in while playing; their result once they cashed out. */
  readonly amount: MinorUnits;
  /** Whether this device records their buy-ins and cash-outs from the table. */
  readonly recordable: boolean;
};

export type LiveTable = {
  /** Who's playing first, then who cashed out, each by when they sat down. */
  readonly seats: ReadonlyArray<TableSeat>;
  /** When the first visit started: the table's time. Null until someone sits down. */
  readonly startedAt: DateTime.Utc | null;
  /** Everyone still playing's buy-ins. */
  readonly inPlay: MinorUnits;
  readonly playing: number;
  /** Someone played here and everyone has cashed out. */
  readonly closed: boolean;
};

const ms = DateTime.toEpochMillis;

const LATER = 5 * 60_000;
const money = (amount: number) => formatMoney(MinorUnits.make(amount), RECORDING_CURRENCY);

/**
 * The table as its live screen shows it. A device that records for everyone holds every visit; a
 * player who joined holds only their own, and sees the others from `server` while it's reachable.
 */
export const liveTable: (
  table: RecordingTableView,
  server: TableView | null | undefined,
) => LiveTable = (table, server) => {
  const everyone = table.role !== "participant";
  const names = new Map(server?.players.map((player) => [player.id, player.displayName]));

  const local = table.visits.map((item) => ({
    summary: item,
    name: item.isSelf ? "You" : item.player.displayName,
    isSelf: item.isSelf,
  }));

  const remote = everyone
    ? []
    : (server?.visits ?? [])
        .filter((item) => item.visit.playerId !== table.you.player.id)
        .map((item) => ({
          summary: item,
          name: names.get(item.visit.playerId) ?? "Player",
          isSelf: false,
        }));

  const listed = [...local, ...remote];
  const named = distinctPlayerNames(listed.map((item) => [item.summary.visit.playerId, item.name]));

  const all = listed.map((item) => ({
    ...item,
    name: named.get(item.summary.visit.playerId)!,
  }));

  const first = all
    .map((item) => item.summary.visit.startedAt)
    .toSorted((a, b) => ms(a) - ms(b))[0];

  const seats = all
    .map(({ summary, name, isSelf }) => {
      const { visit, totals, finalResult } = summary;
      const playing = visit.finishedAt === null;

      return {
        visitId: visit.id,
        playerId: visit.playerId,
        name,
        isSelf,
        playing,
        status: !playing
          ? `Cashed out ${formatTime(visit.finishedAt!)} · ${money(totals.buyIn)} in`
          : first && ms(visit.startedAt) - ms(first) >= LATER
            ? `Playing · sat down ${formatTime(visit.startedAt)}`
            : "Playing",
        amount: playing ? totals.buyIn : finalResult!,
        recordable: everyone && !isSelf,
      };
    })
    .toSorted(
      (a, b) =>
        Number(b.playing) - Number(a.playing) ||
        Number(b.isSelf) - Number(a.isSelf) ||
        ms(started(all, a.visitId)) - ms(started(all, b.visitId)),
    );

  const live = seats.filter((seat) => seat.playing);
  let inPlay = 0n;

  for (const seat of live) inPlay += BigInt(seat.amount);

  return {
    seats,
    startedAt: first ?? null,
    inPlay: MinorUnits.make(Number(inPlay)),
    playing: live.length,
    closed: seats.length > 0 && live.length === 0,
  };
};

const started = (
  all: ReadonlyArray<{
    readonly summary: {
      readonly visit: { readonly id: VisitId; readonly startedAt: DateTime.Utc };
    };
  }>,
  visitId: VisitId,
) => all.find((item) => item.summary.visit.id === visitId)!.summary.visit.startedAt;

const list = (names: ReadonlyArray<string>) =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/** What cashing someone out does to the table: who keeps playing, or that it closes. */
export const cashOutNote = (
  seats: ReadonlyArray<Pick<TableSeat, "visitId" | "name" | "isSelf" | "playing">>,
  visitId: VisitId,
) => {
  const seat = seats.find((item) => item.visitId === visitId)!;
  const whose = seat.isSelf ? "Your" : `${seat.name}'s`;
  const rest = seats.filter((item) => item.playing && item.visitId !== visitId);

  if (rest.length === 0) return `${whose} visit ends, and with it the table.`;
  const verb = rest.length === 1 && !rest[0]!.isSelf ? "keeps" : "keep";

  return `${whose} visit ends. ${list(rest.map((item) => item.name))} ${verb} playing.`;
};

export type TableAction = "edit" | "add_player" | "share" | "settings" | "delete_table";

/**
 * What the live screen's action slot offers. `playing`: the screen is your own visit in play, so
 * you can edit it. A starter adds players, shares and changes settings while the table is open,
 * and deletes it while nobody has played there; a recorder adds players; a joiner edits their own.
 */
export const tableActions = (
  role: RecordingTableView["role"],
  table: { readonly playing: boolean; readonly closed: boolean; readonly empty: boolean },
) => [
  ...(table.playing ? (["edit"] as const) : []),
  ...(role !== "participant" && !table.closed ? (["add_player"] as const) : []),
  ...(role === "starter" && !table.closed ? (["share", "settings"] as const) : []),
  ...(role === "starter" && table.empty ? (["delete_table"] as const) : []),
];
