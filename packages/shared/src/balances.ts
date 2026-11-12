import {
  MinorUnits,
  type Entry,
  type BalanceExplanation,
  type BalanceLine,
  type StakeId,
  type PlayerId,
} from "@stacks/contracts";

import type { StakeOutcome, StakeTerms } from "./stakes.ts";

type BalanceEntry = Pick<Entry, "kind" | "playerId" | "counterpartyId" | "amount" | "voidedAt">;

/**
 * What each player is owed (positive) or owes (negative), from non-voided entries:
 * - a buy-in someone else paid for: the player owes them the amount
 * - a cash-out someone else kept: they owe the player the amount
 * - a settlement: the payer's debt to the payee shrinks by the amount
 *
 * Players who are square are left out, so an empty map means everyone is settled.
 * Balances always sum to zero.
 */
export const balances = (entries: Iterable<BalanceEntry>): ReadonlyMap<PlayerId, MinorUnits> => {
  const totals = new Map<PlayerId, number>();
  const move = (from: PlayerId, to: PlayerId, amount: number) => {
    totals.set(from, (totals.get(from) ?? 0) - amount);
    totals.set(to, (totals.get(to) ?? 0) + amount);
  };

  for (const entry of entries) {
    if (entry.voidedAt !== null || entry.counterpartyId === null) continue;
    if (entry.kind === "buy_in") move(entry.playerId, entry.counterpartyId, entry.amount);
    else if (entry.kind === "cash_out") move(entry.counterpartyId, entry.playerId, entry.amount);
    else if (entry.kind === "settlement") move(entry.counterpartyId, entry.playerId, entry.amount);
  }

  const result = new Map<PlayerId, MinorUnits>();
  for (const [playerId, total] of totals) {
    if (total !== 0) result.set(playerId, MinorUnits.make(total));
  }
  return result;
};

/**
 * Balances after payments the server hasn't confirmed yet, so a screen can stop suggesting a
 * payment the moment it's recorded. Each payment moves `amount` of debt from `from` to `to`.
 */
export const applyPayments = (
  current: ReadonlyMap<PlayerId, MinorUnits>,
  payments: Iterable<{
    readonly from: PlayerId;
    readonly to: PlayerId;
    readonly amount: MinorUnits;
  }>,
): ReadonlyMap<PlayerId, MinorUnits> => {
  const totals = new Map<PlayerId, number>(current);
  for (const { from, to, amount } of payments) {
    totals.set(from, (totals.get(from) ?? 0) + amount);
    totals.set(to, (totals.get(to) ?? 0) - amount);
  }
  const result = new Map<PlayerId, MinorUnits>();
  for (const [playerId, total] of totals) {
    if (total !== 0) result.set(playerId, MinorUnits.make(total));
  }
  return result;
};

/** Signed contributions to the same debt balance, without mixing in table results. */
export const balanceBreakdown = (
  entries: Iterable<BalanceEntry & Pick<Entry, "id" | "sessionId" | "occurredAt">>,
  stakes: Iterable<StakeTerms>,
  outcomes: ReadonlyMap<StakeId, StakeOutcome>,
  playerId: PlayerId,
): BalanceExplanation => {
  const lines: BalanceLine[] = [];
  for (const entry of entries) {
    const other = entry.counterpartyId;
    if (
      entry.voidedAt !== null ||
      other === null ||
      other === entry.playerId ||
      entry.kind === "adjustment"
    )
      continue;
    if (entry.playerId !== playerId && other !== playerId) continue;
    const owner = entry.playerId === playerId;
    const direction = entry.kind === "buy_in" ? (owner ? -1 : 1) : owner ? 1 : -1;
    const amount = MinorUnits.make(direction * entry.amount);
    if (amount === 0) continue;
    lines.push({
      kind:
        entry.kind === "buy_in"
          ? "covered_buy_in"
          : entry.kind === "cash_out"
            ? "held_cash_out"
            : "settlement",
      entryId: entry.id,
      counterpartyId: owner ? other : entry.playerId,
      amount,
      occurredAt: entry.occurredAt,
      sessionId: entry.sessionId,
    });
  }
  for (const stake of stakes) {
    const outcome = outcomes.get(stake.id);
    if (
      !outcome ||
      stake.voidedAt !== null ||
      outcome.owed === 0 ||
      stake.lenderId === stake.borrowerId
    )
      continue;
    if (stake.lenderId !== playerId && stake.borrowerId !== playerId) continue;
    const lender = stake.lenderId === playerId;
    lines.push({
      kind: "stake",
      stakeId: stake.id,
      counterpartyId: lender ? stake.borrowerId : stake.lenderId,
      amount: MinorUnits.make(lender ? outcome.owed : -outcome.owed),
      principal: stake.amount,
      lenderShare: stake.lenderShare,
      result: outcome.result,
      occurredAt: stake.startedAt,
    });
  }
  return { lines, total: MinorUnits.make(lines.reduce((sum, line) => sum + line.amount, 0)) };
};
