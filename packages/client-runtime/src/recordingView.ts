import { personalStats } from "@stacks/shared/stats";
import {
  CurrencyCode,
  MinorUnits,
  type EntryId,
  type GroupListItem,
  type TripId,
  type PlayEntry,
  type PlayerIdentity,
  type Table,
  type VisitId,
  type VisitSummary,
} from "@stacks/contracts";
import { decimalSeparator, formatMoney, minorUnitDigits, parseMoney } from "@stacks/shared/money";
import { ownPlayers } from "@stacks/shared/recording";
import { buyInPresets } from "@stacks/shared/table";
import { projectVisit, visitSummary } from "@stacks/shared/visits";
import * as DateTime from "effect/DateTime";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { formatDay, formatTime, gameNames } from "./format.ts";
import {
  type RecordingCommand,
  type RecordingOperationId,
} from "@stacks/contracts/recordingCommands";

import type { RecordingInput } from "./recording.ts";
import {
  RecordingError,
  type CachedVenue,
  type RecordingRejection,
  type RecordingState,
} from "./recordingState.ts";
import { RecordingStorageConflict, RecordingStorageError } from "./recordingStorage.ts";
import {
  pendingRecordingCommands,
  RecordingSyncBlocked,
  type RecordingSyncStatus,
} from "./recordingSync.ts";

/**
 * The one private ledger on this device. It never changes with sign-in, so signing in or out
 * keeps it, and it is never an account's server history.
 */
export const PRIVATE_RECORDING_NAMESPACE = "device";

/** Private recording is USD until currencies are part of the personal model. */
export const RECORDING_CURRENCY = CurrencyCode.make("USD");

const ms = DateTime.toEpochMillis;

export type RecordedVisit = VisitSummary & {
  readonly table: Table;
  /** The table's venue as this device cached it; null when it has none or isn't cached yet. */
  readonly venue: CachedVenue | null;
};

/** A table this device records for everyone at, while you aren't playing there. */
export type RecordedTable = {
  readonly table: Table;
  readonly venue: CachedVenue | null;
  /** When its first visit started; null until someone sits down. */
  readonly startedAt: DateTime.Utc | null;
  readonly playing: number;
};

export type RecordingHome = {
  /** Every visit still in play, newest first. There can be more than one. */
  readonly active: ReadonlyArray<RecordedVisit>;
  /**
   * Tables you record for everyone at, without a visit of yours in play there, until they close:
   * one you opened without playing, or one you cashed out of while others play. Newest first.
   */
  readonly tables: ReadonlyArray<RecordedTable>;
  /** Finished visits, most recently finished first. */
  readonly finished: ReadonlyArray<RecordedVisit>;
  readonly deleted: ReadonlyArray<RecordedVisit>;
  /** The sum of finished visits' final results; live play never counts. */
  readonly finishedResult: MinorUnits;
};

const tableGameLabel = (table: Pick<Table, "game" | "gameName">) =>
  table.game === "other" && table.gameName?.trim()
    ? table.gameName.trim()
    : table.game
      ? gameNames[table.game]
      : null;

/** A session's name in lists and titles: its game, or just "Session" until one is set. */
export const visitTitle = (table: Pick<Table, "game" | "gameName" | "highLimit">) =>
  `${tableGameLabel(table) ?? "Session"}${table.highLimit ? " · High limit" : ""}`;

/** A table you record at without playing, by name: "Blackjack table". */
export const tableTitle = (table: Pick<Table, "game" | "gameName" | "highLimit">) => {
  const name = tableGameLabel(table);

  return `${name ? `${name} table` : "Table"}${table.highLimit ? " · High limit" : ""}`;
};

const tableOf = (state: RecordingState, tableId: Table["id"]) =>
  state.tables.find((table) => table.id === tableId)!;

const venueOf = (state: RecordingState, table: Table) =>
  state.venues.find((venue) => venue.id === table.venueId) ?? null;

/** Where a venue is, for a line under its name: "Las Vegas, NV", or its kind when it has no city. */
export const venuePlace = (venue: CachedVenue) =>
  [venue.city, venue.region].filter(Boolean).join(", ") ||
  Match.value(venue.kind).pipe(
    Match.when("online", () => "Online"),
    Match.when("home", () => "Home game"),
    Match.orElse(() => ""),
  );

export type VenueChoices = {
  /**
   * `saved` lists the venues this device has cached, before any search. `searching` and `offline`
   * list the cached venues matching the search while the server answers, or when it can't be
   * reached; `found` lists what the server found.
   */
  readonly status: "saved" | "searching" | "found" | "offline";
  readonly venues: ReadonlyArray<CachedVenue>;
};

/**
 * What a venue search shows. `found` is the server's answer: undefined while it's asked, null if it
 * couldn't be reached. Nothing is asked without a name or a location (`searching` false).
 */
export const venueChoices = (
  cached: ReadonlyArray<CachedVenue>,
  q: string,
  searching: boolean,
  found: ReadonlyArray<CachedVenue> | null | undefined,
) => {
  if (searching && found) return { status: "found", venues: found };
  const text = q.trim().toLocaleLowerCase();

  const venues = cached
    .filter((venue) =>
      [venue.name, venue.city ?? ""].some((field) => field.toLocaleLowerCase().includes(text)),
    )
    .toReversed();

  return { status: !searching ? "saved" : found === null ? "offline" : "searching", venues };
};

export const recordingHome: (state: RecordingState) => RecordingHome = (state) => {
  const mine = new Set(ownPlayers(state));
  const own = state.visits.filter((visit) => mine.has(visit.playerId));

  const visits = own.map((visit) => {
    const table = tableOf(state, visit.tableId);

    return { ...visitSummary(visit, state.entries), table, venue: venueOf(state, table) };
  });

  const active = visits
    .filter((item) => item.visit.deletedAt === undefined && item.finalResult === null)
    .toSorted((a, b) => ms(b.visit.startedAt) - ms(a.visit.startedAt));

  const finished = visits
    .filter((item) => item.visit.deletedAt === undefined && item.finalResult !== null)
    .toSorted((a, b) => ms(b.visit.finishedAt!) - ms(a.visit.finishedAt!));

  let total = 0n;

  for (const item of finished) total += BigInt(item.finalResult!);
  const playingHere = new Set(active.map((item) => item.table.id));

  const recording = new Set(
    state.recorders.filter((item) => mine.has(item.playerId)).map((item) => item.tableId),
  );

  const tables = state.tables
    .filter(
      (table) =>
        table.deletedAt === undefined &&
        !playingHere.has(table.id) &&
        (mine.has(table.starterPlayerId) || recording.has(table.id)),
    )
    .flatMap((table) => {
      const here = state.visits.filter(
        (visit) => visit.tableId === table.id && visit.deletedAt === undefined,
      );

      const playing = here.filter((visit) => visit.finishedAt === null).length;

      if (playing === 0 && state.visits.some((visit) => visit.tableId === table.id)) return [];
      const first = here.toSorted((a, b) => ms(a.startedAt) - ms(b.startedAt))[0];

      return [
        { table, venue: venueOf(state, table), startedAt: first?.startedAt ?? null, playing },
      ];
    })
    .toReversed();

  return {
    active,
    tables,
    finished,
    deleted: visits.filter((item) => item.visit.deletedAt !== undefined),
    finishedResult: MinorUnits.make(Number(total)),
  };
};

export type RecordingGrouping = "month" | "year";

/** A history address's period: "2026-11" opens months there, "2026" years. */
export const recordingGroupingOf = (period: string | undefined) =>
  period === undefined
    ? null
    : /^\d{4}-(0[1-9]|1[0-2])$/.test(period)
      ? "month"
      : /^\d{4}$/.test(period)
        ? "year"
        : null;

/**
 * Own sessions by local start month ("2026-11") or year ("2026"), newest first, with deleted
 * visits after that period's visible play. Totals leave out live play and deleted visits.
 */
export const recordingPeriods = (home: RecordingHome, by: RecordingGrouping) => {
  const groups = new Map<string, RecordedVisit[]>();

  for (const item of [...home.active, ...home.finished, ...home.deleted]) {
    const key = localDateText(DateTime.toDateUtc(item.visit.startedAt)).slice(
      0,
      by === "month" ? 7 : 4,
    );

    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  return [...groups]
    .toSorted(([a], [b]) => b.localeCompare(a))
    .map(([period, items]) => {
      const done = items.filter(
        (item) => item.visit.deletedAt === undefined && item.visit.finishedAt,
      );

      const result = done.reduce((sum, item) => sum + BigInt(item.finalResult ?? 0), 0n);

      const minutes = done.reduce(
        (sum, item) =>
          sum + Math.round((ms(item.visit.finishedAt!) - ms(item.visit.startedAt)) / 60_000),
        0,
      );

      return {
        period,
        result: MinorUnits.make(Number(result)),
        finished: done.length,
        minutes,
        visits: items.toSorted(
          (a, b) =>
            Number(a.visit.deletedAt !== undefined) - Number(b.visit.deletedAt !== undefined) ||
            ms(b.visit.startedAt) - ms(a.visit.startedAt),
        ),
      };
    });
};

export type RecordingTableView = {
  readonly table: Table;
  /**
   * `starter` records for everyone here, and so does a `recorder` it appointed; a `participant`
   * records for itself.
   */
  readonly role: "starter" | "recorder" | "participant";
  /** The player this device is at this table, and their visit in play, if any. */
  readonly you: { readonly player: PlayerIdentity; readonly playing: VisitId | null };
  /** Every visit on this device at the table: still playing first, then by when they started. */
  readonly visits: ReadonlyArray<
    VisitSummary & { readonly player: PlayerIdentity; readonly isSelf: boolean }
  >;
  /**
   * Players this device can add now, without a visit in play here: the starter's saved players,
   * or, for a recorder, the players already at the table.
   */
  readonly addable: ReadonlyArray<PlayerIdentity>;
  /** The players the starter appointed to record for everyone here. */
  readonly recorders: ReadonlyArray<PlayerIdentity>;
};

/** The table a visit is at, with everyone recorded there. */
export const recordingTable: (
  state: RecordingState,
  tableId: Table["id"],
) => RecordingTableView | null = (state, tableId) => {
  const table = state.tables.find((item) => item.id === tableId);

  if (
    !table ||
    table.deletedAt !== undefined ||
    (state.visits.some((visit) => visit.tableId === tableId) &&
      !state.visits.some((visit) => visit.tableId === tableId && visit.deletedAt === undefined))
  )
    return null;
  const players = new Map(state.players.map((player) => [player.id, player]));
  const starter = table.starterPlayerId === state.self.id;
  const here = state.participants.filter((item) => item.tableId === tableId);
  const recorders = state.recorders.filter((item) => item.tableId === tableId);
  const owned = new Set(ownPlayers(state));
  const mine = here.filter((item) => owned.has(item.playerId));
  const recording = mine.find((item) => recorders.some((r) => r.playerId === item.playerId));
  const you = starter ? state.self : players.get((recording ?? mine[0] ?? here[0]!).playerId)!;
  const role = starter ? "starter" : recording ? "recorder" : "participant";

  const visits = state.visits
    .filter((visit) => visit.tableId === tableId && visit.deletedAt === undefined)
    .map((visit) => ({
      ...visitSummary(visit, state.entries),
      player: players.get(visit.playerId)!,
      isSelf: visit.playerId === you.id,
    }))
    .toSorted(
      (a, b) =>
        Number(a.visit.finishedAt !== null) - Number(b.visit.finishedAt !== null) ||
        ms(a.visit.startedAt) - ms(b.visit.startedAt),
    );

  const playing = new Set(
    visits.filter((item) => item.visit.finishedAt === null).map((item) => item.player.id),
  );

  const joined = new Set(state.participants.map((item) => item.playerId));

  const seated = new Set([
    ...visits.map((item) => item.player.id),
    ...here.map((item) => item.playerId),
  ]);

  return {
    table,
    role,
    you: {
      player: you,
      playing:
        visits.find((item) => item.player.id === you.id && item.visit.finishedAt === null)?.visit
          .id ?? null,
    },
    visits,
    addable: starter
      ? state.players.filter(
          (player) =>
            !playing.has(player.id) &&
            (!joined.has(player.id) ||
              state.participants.some(
                (item) => item.playerId === player.id && item.tableId === tableId,
              )),
        )
      : role === "recorder"
        ? state.players.filter((player) => seated.has(player.id) && !playing.has(player.id))
        : [],
    recorders: recorders.flatMap((item) => players.get(item.playerId) ?? []),
  };
};

export type RecordingEvent =
  | { readonly type: "finished"; readonly at: DateTime.Utc }
  | {
      readonly type: "reopened";
      readonly at: DateTime.Utc;
      readonly reason: string;
      readonly finishedAt: DateTime.Utc;
    };

export type RecordingVisitView = RecordedVisit & {
  readonly entries: ReadonlyArray<PlayEntry>;
  /** Finishes and reopened finishes, oldest first, from the saved command receipts. */
  readonly events: ReadonlyArray<RecordingEvent>;
  /** The live replacement of each corrected entry. */
  readonly replacedBy: ReadonlyMap<EntryId, EntryId>;
  /** Cash-outs saved by a finish, and their corrections, voided or not. */
  readonly finishCashOuts: ReadonlySet<EntryId>;
  /** The cash-out saved with the latest finish, until a correction or reopen voids it. */
  readonly finalCashOut: PlayEntry | null;
  /** Buy-in amounts to offer, most likely first. */
  readonly presets: ReadonlyArray<number>;
};

export const recordingVisit = (state: RecordingState, visitId: VisitId) => {
  const visit = state.visits.find((item) => item.id === visitId);

  if (!visit) return null;
  const { summary, entries } = projectVisit(visit, state.entries);
  const events: RecordingEvent[] = [];
  let finalCashOutId: EntryId | null = null;
  const finishCashOuts = new Set<EntryId>();

  for (const { command } of state.receipts) {
    if (!("visitId" in command) || command.visitId !== visitId) continue;

    if (command.type === "finish") {
      events.push({ type: "finished", at: command.finishedAt });
      finalCashOutId = command.entryId;
      finishCashOuts.add(command.entryId);
    } else if (command.type === "record_completed") {
      events.push({ type: "finished", at: command.finishedAt });
      finalCashOutId = command.cashOutId;
      finishCashOuts.add(command.cashOutId);
    } else if (command.type === "reopen") {
      const finished = events.findLast((event) => event.type === "finished");
      events.push({
        type: "reopened",
        at: command.preparedAt,
        reason: command.reason,
        finishedAt: finished!.at,
      });
    } else if (command.type === "correct" && finishCashOuts.has(command.entryId)) {
      if (command.replacement) finishCashOuts.add(command.replacement.id);

      if (command.entryId === finalCashOutId) finalCashOutId = command.replacement?.id ?? null;
    }
  }

  const replacedBy = new Map<EntryId, EntryId>();

  for (const entry of entries)
    if (entry.replacesEntryId !== null) replacedBy.set(entry.replacesEntryId, entry.id);

  const finalCashOut =
    entries.find((entry) => entry.id === finalCashOutId && entry.voidedAt === null) ?? null;

  const table = tableOf(state, visit.tableId);

  return {
    ...summary,
    table,
    venue: venueOf(state, table),
    entries,
    events,
    replacedBy,
    finishCashOuts,
    finalCashOut,
    presets: buyInPresets(
      entries.map((entry) => ({ ...entry, playerId: state.self.id })),
      state.self.id,
    ),
  };
};

/**
 * The next change that brings a visit's buy-ins to `total`: one more buy-in for the difference, or
 * a correction to the newest buy-in still standing when the total goes down. Corrections void the
 * buy-in, or replace it with what's left of it, so history keeps every amount. Null once the total
 * matches. Apply it, then ask again: a smaller total can take several corrections.
 */
export const nextBuyInChange: (
  visit: RecordingVisitView,
  total: number,
) => RecordingInput | null = (visit, total) => {
  if (!Number.isSafeInteger(total) || total <= 0)
    throw new RecordingError("invalid", "The buy-in total must be more than zero.");
  const current = visit.totals.buyIn;

  if (total === current) return null;

  if (total > current)
    return { type: "add", visitId: visit.visit.id, kind: "buy_in", amount: total - current };

  const newest = visit.entries
    .filter((entry) => entry.kind === "buy_in" && entry.voidedAt === null)
    .toSorted(
      (a, b) => ms(b.occurredAt) - ms(a.occurredAt) || ms(b.createdAt) - ms(a.createdAt),
    )[0]!;

  const remaining = newest.amount - (current - total);

  return {
    type: "correct",
    visitId: visit.visit.id,
    entryId: newest.id,
    reason: "Buy-in total changed",
    replacement:
      remaining <= 0
        ? null
        : newest.counterpartyId === null
          ? { amount: remaining }
          : { amount: remaining, counterpartyId: newest.counterpartyId },
  };
};

const money = (amount: number) => formatMoney(MinorUnits.make(amount), RECORDING_CURRENCY);

/**
 * Reads a typed amount. `minimum` is 1 where zero isn't a valid record (a buy-in), and 0 where it
 * is (a cash-out). Blank, negative, sub-cent and unsafe amounts each get their own sentence.
 */
export const parseRecordingAmount = (text: string, minimum: 0 | 1) => {
  const trimmed = text.trim();

  if (trimmed === "") return { error: "Enter an amount." };
  const known = new Set(`-${money(-123456789)}${decimalSeparator()}`.replace(/\d/g, ""));

  if (
    [...trimmed].some((char) => !/[\d\s]/.test(char) && !known.has(char)) ||
    /\d\s+\d/.test(trimmed)
  )
    return { error: `Enter an amount like ${money(20000)}.` };
  const parsed = Option.getOrNull(parseMoney(trimmed, RECORDING_CURRENCY));

  if (parsed === null) {
    const decimal = escape(decimalSeparator());

    if (new RegExp(`${decimal}\\d{${minorUnitDigits(RECORDING_CURRENCY) + 1},}\\s*$`).test(trimmed))
      return { error: "Use whole cents, like 12.50." };

    if (/\d{16,}/.test(trimmed.replace(/\D/g, ""))) return { error: "That amount is too large." };

    return { error: `Enter an amount like ${money(20000)}.` };
  }

  if (parsed < 0) return { error: "Enter an amount without a minus sign." };

  if (parsed < minimum) return { error: "Enter an amount greater than zero." };

  return { amount: parsed, error: null };
};

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");

/** An amount as someone would type it: "120.50" or "200", no symbol or grouping. */
export const amountInputText = (amount: number) => {
  const digits = minorUnitDigits(RECORDING_CURRENCY);

  if (amount % 10 ** digits === 0) return String(amount / 10 ** digits);
  const magnitude = String(Math.abs(amount)).padStart(digits + 1, "0");

  return `${amount < 0 ? "-" : ""}${magnitude.slice(0, -digits)}${decimalSeparator()}${magnitude.slice(-digits)}`;
};

/** One sentence for a failed load or save. The caller says what was kept. */
export const describeRecordingError = (error: typeof Schema.Unknown.Encoded) => {
  if (error instanceof RecordingStorageConflict)
    return "This session changed on another screen. Check it, then try again.";

  if (error instanceof RecordingError) {
    if (error.reason === "conflict")
      return "This session changed on another screen. Check it, then try again.";

    if (error.reason === "load") return "Couldn't open the sessions saved on this device.";

    if (error.reason === "invalid" || error.reason === "forbidden") return error.message;

    if (error.reason === "operation_reused")
      return "This was already saved with different details. Start it again.";

    return "Recording is closed. Reload the page.";
  }

  if (error instanceof RecordingStorageError) {
    if (error.reason === "quota") return "This device is out of storage space. Couldn't save.";

    if (error.reason === "unavailable")
      return "This browser won't let Color Up save on this device. Private browsing can do this.";

    if (error.reason === "corrupt")
      return "The sessions saved on this device are damaged. Nothing was changed.";
  }

  return "Couldn't save on this device.";
};

/** Whether trying the same prepared command again can succeed. A conflict needs a fresh look. */
export const canRetryRecording = (error: typeof Schema.Unknown.Encoded) =>
  !(error instanceof RecordingStorageConflict) &&
  !(
    error instanceof RecordingError &&
    (error.reason === "conflict" ||
      error.reason === "operation_reused" ||
      error.reason === "invalid" ||
      error.reason === "forbidden")
  );

const localTime = (date: string, time: string) => {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const clock = /^(\d{1,2}):(\d{2})$/.exec(time.trim());

  if (!day || !clock) return null;
  const [year, month, dayOfMonth] = [Number(day[1]), Number(day[2]), Number(day[3])];
  const [hours, minutes] = [Number(clock[1]), Number(clock[2])];

  if (hours > 23 || minutes > 59) return null;
  const value = new Date(year, month - 1, dayOfMonth, hours, minutes);

  return value.getFullYear() === year &&
    value.getMonth() === month - 1 &&
    value.getDate() === dayOfMonth
    ? value
    : null;
};

export type PastSessionField = "date" | "start" | "finish";

/**
 * Reads local start and finish times. An overnight session has an explicit next-day finish.
 * A bad form reports every field that's wrong.
 */
export const parsePastSessionTimes = (
  input: {
    readonly date: string;
    readonly start: string;
    readonly finish: string;
    readonly finishNextDay?: boolean;
  },
  now = Date.now(),
) => {
  const refused = (errors: Partial<Record<PastSessionField, string>>) => {
    const [field, error] = (["date", "start", "finish"] as const)
      .map((name) => [name, errors[name]] as const)
      .find((entry): entry is readonly [PastSessionField, string] => entry[1] !== undefined)!;

    return { field, error, errors };
  };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date.trim()) || !localTime(input.date, "00:00"))
    return refused({ date: "Enter a date like 2026-11-07." });
  const start = localTime(input.date, input.start);
  const finish = localTime(input.date, input.finish);
  const errors: Partial<Record<PastSessionField, string>> = {};

  if (!start) errors.start = "Choose a start time.";

  if (!finish) errors.finish = "Choose a finish time.";

  if (start && finish) {
    if (input.finishNextDay) finish.setDate(finish.getDate() + 1);

    if (finish <= start) errors.finish = "Finish after the start.";
    else if (finish.getTime() > now) errors.finish = "A past session can't finish in the future.";
  }

  if (!start || !finish || errors.finish !== undefined) return refused(errors);

  return {
    startedAt: DateTime.makeUnsafe(start),
    finishedAt: DateTime.makeUnsafe(finish),
    error: null,
  };
};

/**
 * Reads a time of day ("21:30") as the moment nearest `reference`, in local time: within twelve
 * hours either side, so an evening time read just after midnight is the night before. Null if it
 * isn't a time.
 */
export const parseTimeNear = (time: string, reference: DateTime.Utc) => {
  const clock = /^(\d{1,2}):(\d{2})$/.exec(time.trim());

  if (!clock) return null;
  const [hours, minutes] = [Number(clock[1]), Number(clock[2])];

  if (hours > 23 || minutes > 59) return null;
  const around = new Date(DateTime.toEpochMillis(reference));
  const value = new Date(around);
  value.setHours(hours, minutes, 0, 0);
  const half = 12 * 60 * 60 * 1000;

  if (value.getTime() - around.getTime() > half) value.setDate(value.getDate() - 1);
  else if (around.getTime() - value.getTime() > half) value.setDate(value.getDate() + 1);

  return DateTime.makeUnsafe(value);
};

/** A moment as a time field holds it: "21:30", in local time. */
export const localTimeText = (at: DateTime.Utc) => {
  const value = new Date(DateTime.toEpochMillis(at));
  const pad = (n: number) => String(n).padStart(2, "0");

  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
};

/** Today as a date field holds it: "2026-11-07", in local time. */
export const localDateText = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

const changes = (count: number) => (count === 1 ? "1 change" : `${count} changes`);

/** What a refused change was, and why the account refused it. */
export const describeRecordingRejection = ({ command, reason, message }: RecordingRejection) => {
  if (command.type === "set_table_trip")
    return `The trip choice didn't sync. ${message} Your recorded play is saved. Choose a trip again from Edit.`;

  const what = Match.value(command).pipe(
    Match.when({ type: "start" }, (command) => `Starting a session with ${money(command.buyIn)}`),
    Match.when(
      { type: "record_completed" },
      (command) =>
        `A past session with ${money(command.buyIn)} in and ${money(command.cashOut)} out`,
    ),
    Match.when({ type: "join_table" }, (command) =>
      command.newPlayer
        ? `Adding ${command.newPlayer.displayName} with ${money(command.buyIn)}`
        : `Sitting down with ${money(command.buyIn)}`,
    ),
    Match.when(
      { type: "add" },
      (command) =>
        `A ${money(command.amount)} ${command.kind === "buy_in" ? "buy-in" : "cash-out"}`,
    ),
    Match.when({ type: "finish" }, (command) => `Finishing with ${money(command.amount)}`),
    Match.when({ type: "correct" }, () => "A correction"),
    Match.when({ type: "delete_visit" }, () => "Deleting a session"),
    Match.when({ type: "restore_visit" }, () => "Restoring a session"),
    Match.when({ type: "reopen" }, () => "Reopening a session"),
    Match.when({ type: "edit_visit" }, () => "Changing a session's details"),
    Match.when({ type: "appoint_recorder" }, () => "Letting a player record for everyone"),
    Match.orElse(() => "Stopping a recorder"),
  );

  const why = Match.value(reason).pipe(
    Match.when("conflict", () => "The session changed on another device."),
    Match.when("operation_reused", () => "Your account already has it with different details."),
    Match.when("forbidden", () => "At this table you can record only your own play."),
    Match.orElse(() => "It doesn't fit the session as your account has it."),
  );

  return `${what} didn't sync. ${why}`;
};

export type RecordingSyncLine = {
  readonly kind: "device" | "syncing" | "waiting" | "synced" | "blocked";
  readonly text: string;
};

type SyncPhase = Pick<RecordingSyncStatus, "phase" | "error">;

/** What signing in did with the tables on this device: a quiet confirmation, or a refusal. */
export type ClaimLine = {
  readonly kind: "claimed" | "refused";
  readonly text: string;
};

export const claimLines = (claim: RecordingSyncStatus["claim"]) => {
  if (claim === null) return [];
  const lines: ClaimLine[] = [];

  if (claim.adopted || claim.claimed.length > 0)
    lines.push({
      kind: "claimed",
      text: "Your tables from this device are now in your account.",
    });
  const [first, ...rest] = claim.refused;

  if (first)
    lines.push({
      kind: "refused",
      text:
        rest.length === 0
          ? `${first.displayName} already belongs to another account, so they stay out of yours.`
          : `${claim.refused.length} players on this device already belong to another account, so they stay out of yours.`,
    });

  return lines;
};

export type RecordingSyncView = {
  readonly line: RecordingSyncLine;
  /** Refused changes, oldest first: each needs recording again or discarding. */
  readonly rejected: ReadonlyArray<{
    readonly operationId: RecordingOperationId;
    readonly sentence: string;
  }>;
};

/**
 * The quiet line on a recording screen, and the refusals to resolve. Signed out, everything stays
 * on the device. Pass a visit to count only its changes.
 */
export const recordingSyncView: (
  state: RecordingState | null,
  sync: SyncPhase | null,
  visitId?: VisitId,
) => RecordingSyncView = (state, sync, visitId) =>
  syncView(
    state,
    sync,
    (command) =>
      visitId === undefined ||
      ("visitId" in command && command.visitId === visitId) ||
      (command.type === "set_table_trip" &&
        state?.visits.some((visit) => visit.id === visitId && visit.tableId === command.tableId) ===
          true),
  );

const syncView: (
  state: RecordingState | null,
  sync: SyncPhase | null,
  mine: (command: RecordingCommand) => boolean,
) => RecordingSyncView = (state, sync, mine) => {
  const rejected = (state?.sync?.rejected ?? [])
    .filter((item) => mine(item.command))
    .map((item) => ({
      operationId: item.command.operationId,
      sentence: describeRecordingRejection(item),
    }));

  if (state === null || sync === null)
    return { line: { kind: "device", text: "Saved on this device" }, rejected };

  if (sync.phase === "blocked")
    return {
      line: {
        kind: "blocked",
        text:
          sync.error instanceof RecordingSyncBlocked && sync.error.reason === "separate_player"
            ? "Saved on this device. These sessions are a different player from the one on your account, so they don't sync to it yet."
            : "Saved on this device. These sessions belong to another account, so they don't sync to this one.",
      },
      rejected: [],
    };
  const pending = pendingRecordingCommands(state).filter(mine).length;

  if (state.sync !== undefined && pending === 0)
    return {
      line: {
        kind: "synced",
        text: state.sync.userId === null ? "Synced from this device" : "Synced to your account",
      },
      rejected,
    };

  if (sync.phase === "syncing") return { line: { kind: "syncing", text: "Syncing…" }, rejected };
  const waiting = pending > 0 ? changes(pending) : "Your sessions";

  return {
    line: {
      kind: "waiting",
      text:
        sync.phase === "retrying"
          ? `Saved on this device. ${waiting} will sync once Color Up can be reached.`
          : `Saved on this device. ${waiting} waiting to sync.`,
    },
    rejected,
  };
};

/** The reason an undo saves, which tells a correction from taking a rebuy back. */
export const UNDONE_REASON = "Undone";

export const LIVE_REBUY_AMOUNTS = [10000, 20000] as const;

/** Time since `start` as the LIVE pill reads it: "1:48:22". */
export const elapsedClock = (
  start: DateTime.Utc,
  now: DateTime.Utc,
  style: "full" | "compact" = "full",
) => {
  const seconds = Math.floor(Math.max(0, ms(now) - ms(start)) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secondsText = (seconds % 60).toString().padStart(2, "0");

  if (style === "compact" && hours === 0) return `${minutes}:${secondsText}`;

  return `${hours}:${minutes.toString().padStart(2, "0")}:${secondsText}`;
};

export const sessionReadout = (visit: RecordingVisitView, now: DateTime.Utc) => {
  const end = visit.visit.finishedAt ?? now;
  const elapsed = Math.max(0, ms(end) - ms(visit.visit.startedAt));

  return {
    clock: elapsedClock(visit.visit.startedAt, end),
    buyIns: visit.entries.filter((entry) => entry.kind === "buy_in" && entry.voidedAt === null)
      .length,
    corrected: visit.entries.some(
      (entry) =>
        entry.kind === "buy_in" && entry.voidedAt !== null && entry.voidReason !== UNDONE_REASON,
    ),
    hourly:
      visit.finalResult === null || elapsed === 0
        ? null
        : personalStats([visit], DateTime.zoneMakeNamedUnsafe("UTC")).summary.hourlyResult,
  };
};

export const buyInTotalPreview = (
  current: number,
  text: string,
  mode: "add" | "subtract" | "set",
) => {
  const typed = parseRecordingAmount(text, 1);

  if (typed.error !== null) return null;

  const total = Match.value(mode).pipe(
    Match.when("add", () => current + typed.amount),
    Match.when("subtract", () => current - typed.amount),
    Match.when("set", () => typed.amount),
    Match.exhaustive,
  );

  return Number.isSafeInteger(total) && total > 0 ? total : null;
};

/** What saving a buy-in change does, in the button: "Add $50", "Subtract $50" or "Set total $300". */
export const buyInTotalLabel = (mode: "add" | "subtract" | "set", text: string) => {
  const verb = Match.value(mode).pipe(
    Match.when("add", () => "Add"),
    Match.when("subtract", () => "Subtract"),
    Match.when("set", () => "Set total"),
    Match.exhaustive,
  );

  const typed = parseRecordingAmount(text, 1);

  return typed.error === null ? `${verb} ${money(typed.amount)}` : verb;
};

export function applyAmountKey(amount: string, key: string, decimal: string) {
  if (key === "back") return amount.slice(0, -1);

  if (key === "sign") return amount.startsWith("-") ? amount.slice(1) : `-${amount}`;

  if (key === decimal && amount.includes(decimal)) return amount;

  return amount === "0" && key !== decimal ? key : amount + key;
}

export const cashOutResultPreview = (visit: RecordingVisitView, text: string) => {
  const parsed = parseRecordingAmount(text, 0);

  if (parsed.error !== null) return null;
  const result = visit.totals.cashOut - visit.totals.buyIn + parsed.amount;

  return Number.isSafeInteger(result) ? result : null;
};

export type SessionEditField = "buy_in" | "start_time" | "game" | "venue";

export const sessionEditFields = (visit: RecordingVisitView, canEditTable: boolean) => {
  const fields: Array<{ field: SessionEditField; label: string; value: string }> = [];

  if (visit.visit.finishedAt === null)
    fields.push({ field: "buy_in", label: "Buy-in total", value: money(visit.totals.buyIn) });
  fields.push({
    field: "start_time",
    label: "Started",
    value: `${formatDay(visit.visit.startedAt)} · ${formatTime(visit.visit.startedAt)}`,
  });

  if (canEditTable)
    fields.push(
      { field: "game", label: "Game", value: visitTitle(visit.table) },
      { field: "venue", label: "Casino", value: visit.venue?.name ?? "Not set" },
    );

  return fields;
};

export const tableTripOptions = (groups: ReadonlyArray<GroupListItem>, selected: TripId | null) => {
  const compatible = groups.filter(({ group }) => group.currency === RECORDING_CURRENCY);

  const mismatched = groups.some(
    ({ group, trips }) =>
      group.currency !== RECORDING_CURRENCY && trips.some((trip) => trip.id === selected),
  );

  const live = compatible.flatMap(({ group, trips }) =>
    trips
      .filter((trip) => trip.endedAt === null)
      .map((trip) => ({ key: trip.id, label: `${group.name} · ${trip.name}` })),
  );

  return [
    { key: "", label: "Personal · no trip" },
    ...(selected && !mismatched && !live.some((item) => item.key === selected)
      ? [{ key: selected, label: "Current trip" }]
      : []),
    ...live,
  ];
};

export type HistoryLine =
  | { readonly type: "entry"; readonly at: DateTime.Utc; readonly entry: PlayEntry }
  | { readonly type: "event"; readonly at: DateTime.Utc; readonly event: RecordingEvent };

/**
 * A visit's history, newest first, with the entries that still stand above the voided ones so a
 * correction never sinks under what it replaced. A finish is a line like any other.
 */
export const historyLines: (visit: RecordingVisitView) => ReadonlyArray<HistoryLine> = (visit) => {
  const lines: Array<HistoryLine> = [];

  for (const entry of visit.entries) lines.push({ type: "entry", at: entry.occurredAt, entry });

  for (const event of visit.events) lines.push({ type: "event", at: event.at, event });

  return lines.toSorted((a, b) => {
    const voided = (line: HistoryLine) =>
      line.type === "entry" && line.entry.voidedAt !== null ? 1 : 0;

    return (
      voided(a) - voided(b) ||
      ms(b.at) - ms(a.at) ||
      (a.type === "event" ? 0 : 1) - (b.type === "event" ? 0 : 1) ||
      (a.type === "entry" && b.type === "entry" ? ms(b.entry.createdAt) - ms(a.entry.createdAt) : 0)
    );
  });
};

/** What a history row calls an entry: the first buy-in, later rebuys, and a buy-in total's fix. */
export const historyEntryName = (visit: RecordingVisitView, entry: PlayEntry) => {
  if (entry.kind === "cash_out")
    return visit.finishCashOuts.has(entry.id) ? "Final cash-out" : "Cash-out";

  if (entry.replacesEntryId !== null) return "Corrected buy-in";

  const first = visit.entries
    .filter((item) => item.kind === "buy_in" && item.replacesEntryId === null)
    .toSorted(
      (a, b) => ms(a.occurredAt) - ms(b.occurredAt) || ms(a.createdAt) - ms(b.createdAt),
    )[0];

  return first?.id === entry.id ? "Buy-in" : "Rebuy";
};

/**
 * A start edited as a date ("2026-11-06") and a time ("21:30"), local: the moment, or which field
 * is wrong. Fields left as they were keep `initial` to the second, so a session that finished within
 * its first minute still follows it. It can't be after `latest`, the first thing recorded.
 */
export const parseStartedAt: (
  input: { readonly date: string; readonly time: string },
  initial: DateTime.Utc,
  latest: DateTime.Utc,
) =>
  | { readonly startedAt: DateTime.Utc; readonly error: null }
  | { readonly field: "date" | "time"; readonly error: string } = (input, initial, latest) => {
  if (input.date === localDateText(new Date(ms(initial))) && input.time === localTimeText(initial))
    return { startedAt: initial, error: null };

  if (!localTime(input.date, "00:00"))
    return { field: "date", error: "Enter a date like 2026-11-07." };
  const value = localTime(input.date, input.time);

  if (!value) return { field: "time", error: "Enter a time like 21:30." };

  if (value.getTime() > ms(latest))
    return { field: "date", error: "The start can't be after your first buy-in." };

  return { startedAt: DateTime.makeUnsafe(value), error: null };
};
