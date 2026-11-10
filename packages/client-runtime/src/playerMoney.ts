import type {
  ActorId,
  EntryId,
  MinorUnits,
  PairHistory,
  PlayerId,
  PlayerIdentity,
  PlayerPair,
  TableId,
} from "@stacks/contracts";
import {
  isPairCommand,
  type PairCommand,
  type TableView,
} from "@stacks/contracts/recordingCommands";
import * as DateTime from "effect/DateTime";

import { pendingRecordingCommands } from "./recordingSync.ts";
import type { RecordingState } from "./recordingState.ts";

/**
 * How a pair's balance reads to one of its players. `owed` means the counterparty owes them;
 * `owe` means they owe the counterparty. Copy is shared by web and mobile.
 */
export type PairStanding = {
  readonly direction: "owed" | "owe" | "square";
  readonly amount: MinorUnits | null;
  readonly text: string;
};

export const pairStanding = (pair: PlayerPair): PairStanding => {
  const name = pair.counterparty.displayName;
  if (pair.balance === null) return { direction: "square", amount: null, text: "Square" };
  return pair.balance.creditorId === pair.playerId
    ? { direction: "owed", amount: pair.balance.amount, text: `${name} owes you` }
    : { direction: "owe", amount: pair.balance.amount, text: `You owe ${name}` };
};

/** One fact between the pair, as its history lists it, newest first. */
export type PairHistoryRow = {
  readonly id: EntryId;
  readonly kind: "covered" | "held" | "payment";
  readonly text: string;
  readonly amount: MinorUnits;
  /** Which way it moved the balance for the viewer: `owed` adds to what they're owed. */
  readonly direction: "owed" | "owe";
  readonly occurredAt: DateTime.Utc;
  readonly recordedBy: string;
  readonly correction: boolean;
  readonly voided: { readonly by: string; readonly reason: string | null } | null;
};

/**
 * The play and payments between the pair, voids and corrections included, with who recorded
 * each. `selfActorId` reads as "You".
 */
export const pairHistoryRows = (
  history: PairHistory,
  selfActorId: ActorId | null,
): ReadonlyArray<PairHistoryRow> => {
  const me = history.pair.playerId;
  const them = history.pair.counterparty.displayName;
  const names = new Map(history.actors.map((actor) => [actor.actorId, actor.displayName]));
  const who = (actorId: ActorId) =>
    actorId === selfActorId ? "You" : (names.get(actorId) ?? "Someone");
  const audit = (fact: {
    readonly createdBy: ActorId;
    readonly voidedBy: ActorId | null;
    readonly voidReason: string | null;
    readonly replacesEntryId: EntryId | null;
  }) => ({
    recordedBy: who(fact.createdBy),
    correction: fact.replacesEntryId !== null,
    voided: fact.voidedBy === null ? null : { by: who(fact.voidedBy), reason: fact.voidReason },
  });
  const rows: Array<PairHistoryRow & { readonly createdAt: number }> = [];
  for (const { playerId, entry } of history.play) {
    if (entry.kind === "adjustment") continue;
    const mine = playerId === me;
    const covered = entry.kind === "buy_in";
    rows.push({
      id: entry.id,
      kind: covered ? "covered" : "held",
      text: covered
        ? mine
          ? `${them} covered your buy-in`
          : `You covered ${them}'s buy-in`
        : mine
          ? `${them} took your cash-out`
          : `You took ${them}'s cash-out`,
      amount: entry.amount,
      direction: covered === mine ? "owe" : "owed",
      occurredAt: entry.occurredAt,
      createdAt: DateTime.toEpochMillis(entry.createdAt),
      ...audit(entry),
    });
  }
  for (const repayment of history.repayments) {
    const paid = repayment.fromPlayerId === me;
    rows.push({
      id: repayment.id,
      kind: "payment",
      text: paid ? `You paid ${them}` : `${them} paid you`,
      amount: repayment.amount,
      direction: paid ? "owed" : "owe",
      occurredAt: repayment.occurredAt,
      createdAt: DateTime.toEpochMillis(repayment.createdAt),
      ...audit(repayment),
    });
  }
  return rows
    .toSorted((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1))
    .map(({ createdAt: _, ...row }) => row);
};

/** Payment commands on this device the server hasn't confirmed, with `counterpartyId` if given. */
export const pendingPayments = (
  state: RecordingState | null,
  counterpartyId?: PlayerId,
): ReadonlyArray<PairCommand> => {
  if (!state) return [];
  return pendingRecordingCommands(state)
    .filter(isPairCommand)
    .filter((command) => {
      if (counterpartyId === undefined) return true;
      const ends =
        command.type === "repay"
          ? command
          : state.repayments.find((item) => item.id === command.repaymentId);
      return ends?.fromPlayerId === counterpartyId || ends?.toPlayerId === counterpartyId;
    });
};

/**
 * Who can be named as Paid by or Paid to on `playerId`'s entry at a table: everyone else at it,
 * from this device and, when it's been fetched, the server's view of the whole table.
 */
export const counterpartiesAt = (
  state: RecordingState | null,
  tableId: TableId,
  playerId: PlayerId,
  view: TableView | null = null,
): ReadonlyArray<PlayerIdentity> => {
  const known = new Map<PlayerId, PlayerIdentity>();
  for (const player of [...(state?.players ?? []), ...(view?.players ?? [])])
    known.set(player.id, player);
  const ids = new Set<PlayerId>([
    ...(state?.tables.filter((table) => table.id === tableId).map((t) => t.starterPlayerId) ?? []),
    ...(state?.visits.filter((visit) => visit.tableId === tableId).map((v) => v.playerId) ?? []),
    ...(state?.participants.filter((item) => item.tableId === tableId).map((p) => p.playerId) ??
      []),
    ...(view?.table.id === tableId ? view.players.map((player) => player.id) : []),
  ]);
  ids.delete(playerId);
  return [...ids]
    .flatMap((id) => {
      const player = known.get(id);
      if (!player) return [];
      return [id === state?.self.id ? { ...player, displayName: "You" } : player];
    })
    .toSorted((a, b) => a.displayName.localeCompare(b.displayName));
};
