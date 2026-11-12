import {
  CurrencyCode,
  MinorUnits,
  type EntryId,
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
import * as Option from "effect/Option";

import { gameNames } from "./format.ts";
import {
  type RecordingCommand,
  type RecordingOperationId,
} from "@stacks/contracts/recordingCommands";

import { RecordingError, type RecordingRejection, type RecordingState } from "./recordingState.ts";
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

export type RecordedVisit = VisitSummary & { readonly table: Table };

export type RecordingHome = {
  /** Every visit still in play, newest first. There can be more than one. */
  readonly active: ReadonlyArray<RecordedVisit>;
  /** Finished visits, most recently finished first. */
  readonly finished: ReadonlyArray<RecordedVisit>;
  /** The sum of finished visits' final results; live play never counts. */
  readonly finishedResult: MinorUnits;
};

/** A session's name in lists and titles: its game, or just "Session" until one is set. */
export const visitTitle = (table: Table) =>
  `${table.game ? gameNames[table.game] : "Session"}${table.highLimit ? " · High limit" : ""}`;

const tableOf = (state: RecordingState, tableId: Table["id"]) =>
  state.tables.find((table) => table.id === tableId)!;

export const recordingHome = (state: RecordingState): RecordingHome => {
  // Other players' visits at your tables are theirs; they show on the table, not in your play.
  const mine = new Set(ownPlayers(state));
  const own = state.visits.filter((visit) => mine.has(visit.playerId));
  const visits = own.map((visit) => ({
    ...visitSummary(visit, state.entries),
    table: tableOf(state, visit.tableId),
  }));
  const active = visits
    .filter((item) => item.finalResult === null)
    .toSorted((a, b) => ms(b.visit.startedAt) - ms(a.visit.startedAt));
  const finished = visits
    .filter((item) => item.finalResult !== null)
    .toSorted((a, b) => ms(b.visit.finishedAt!) - ms(a.visit.finishedAt!));
  let total = 0n;
  for (const item of finished) total += BigInt(item.finalResult!);
  // MinorUnits refuses an unsafe integer, so an overflowing total fails loudly.
  return { active, finished, finishedResult: MinorUnits.make(Number(total)) };
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
export const recordingTable = (
  state: RecordingState,
  tableId: Table["id"],
): RecordingTableView | null => {
  const table = state.tables.find((item) => item.id === tableId);
  if (!table) return null;
  const players = new Map(state.players.map((player) => [player.id, player]));
  const starter = table.starterPlayerId === state.self.id;
  const here = state.participants.filter((item) => item.tableId === tableId);
  const recorders = state.recorders.filter((item) => item.tableId === tableId);
  const recording = here.find((item) => recorders.some((r) => r.playerId === item.playerId));
  const you = starter ? state.self : players.get((recording ?? here[0]!).playerId)!;
  const role = starter ? "starter" : recording ? "recorder" : "participant";
  const visits = state.visits
    .filter((visit) => visit.tableId === tableId)
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

export const recordingVisit = (
  state: RecordingState,
  visitId: VisitId,
): RecordingVisitView | null => {
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
  return {
    ...summary,
    table: tableOf(state, visit.tableId),
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

const money = (amount: number) => formatMoney(MinorUnits.make(amount), RECORDING_CURRENCY);

/**
 * Reads a typed amount. `minimum` is 1 where zero isn't a valid record (a buy-in), and 0 where it
 * is (a cash-out). Blank, negative, sub-cent and unsafe amounts each get their own sentence.
 */
export const parseRecordingAmount = (
  text: string,
  minimum: 0 | 1,
): { readonly amount: MinorUnits; readonly error: null } | { readonly error: string } => {
  const trimmed = text.trim();
  if (trimmed === "") return { error: "Enter an amount." };
  // parseMoney drops characters it doesn't know, so "1e3" would read as 13.
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
export const describeRecordingError = (error: unknown): string => {
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
export const canRetryRecording = (error: unknown) =>
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

/**
 * Reads a past session's local date ("2026-11-07") and start and finish times ("21:30"). A finish
 * earlier than the start is the next morning. A session can't finish in the future.
 */
export const parsePastSessionTimes = (
  input: { readonly date: string; readonly start: string; readonly finish: string },
  now = Date.now(),
):
  | { readonly startedAt: DateTime.Utc; readonly finishedAt: DateTime.Utc; readonly error: null }
  | { readonly field: "date" | "start" | "finish"; readonly error: string } => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date.trim()) || !localTime(input.date, "00:00"))
    return { field: "date", error: "Enter a date like 2026-11-07." };
  const start = localTime(input.date, input.start);
  if (!start) return { field: "start", error: "Enter a time like 21:30." };
  const finish = localTime(input.date, input.finish);
  if (!finish) return { field: "finish", error: "Enter a time like 23:45." };
  if (finish < start) finish.setDate(finish.getDate() + 1);
  if (finish.getTime() > now)
    return { field: "finish", error: "A past session can't finish in the future." };
  return {
    startedAt: DateTime.makeUnsafe(start),
    finishedAt: DateTime.makeUnsafe(finish),
    error: null,
  };
};

/** Today as a date field holds it: "2026-11-07", in local time. */
export const localDateText = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

const changes = (count: number) => (count === 1 ? "1 change" : `${count} changes`);

/** What a refused change was, and why the account refused it. */
export const describeRecordingRejection = ({ command, reason }: RecordingRejection) => {
  const what =
    command.type === "start"
      ? `Starting a session with ${money(command.buyIn)}`
      : command.type === "record_completed"
        ? `A past session with ${money(command.buyIn)} in and ${money(command.cashOut)} out`
        : command.type === "join_table"
          ? command.newPlayer
            ? `Adding ${command.newPlayer.displayName} with ${money(command.buyIn)}`
            : `Sitting down with ${money(command.buyIn)}`
          : command.type === "add"
            ? `A ${money(command.amount)} ${command.kind === "buy_in" ? "buy-in" : "cash-out"}`
            : command.type === "finish"
              ? `Finishing with ${money(command.amount)}`
              : command.type === "correct"
                ? "A correction"
                : command.type === "reopen"
                  ? "Reopening a session"
                  : command.type === "appoint_recorder"
                    ? "Letting a player record for everyone"
                    : "Stopping a recorder";
  const why =
    reason === "conflict"
      ? "The session changed on another device."
      : reason === "operation_reused"
        ? "Your account already has it with different details."
        : reason === "forbidden"
          ? "At this table you can record only your own play."
          : "It doesn't fit the session as your account has it.";
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

export const claimLines = (claim: RecordingSyncStatus["claim"]): ReadonlyArray<ClaimLine> => {
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
export const recordingSyncView = (
  state: RecordingState | null,
  sync: SyncPhase | null,
  visitId?: VisitId,
): RecordingSyncView =>
  syncView(
    state,
    sync,
    (command) => visitId === undefined || ("visitId" in command && command.visitId === visitId),
  );

const syncView = (
  state: RecordingState | null,
  sync: SyncPhase | null,
  mine: (command: RecordingCommand) => boolean,
): RecordingSyncView => {
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
