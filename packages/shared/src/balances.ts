import { MinorUnits, type Entry, type PlayerId } from "@stacks/contracts";

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
