import { MinorUnits, type PlayerId } from "@stacks/contracts";

export interface Transfer {
  readonly from: PlayerId;
  readonly to: PlayerId;
  readonly amount: MinorUnits;
}

const byAmountThenId = (
  a: { readonly id: PlayerId; readonly amount: number },
  b: { readonly id: PlayerId; readonly amount: number },
) => b.amount - a.amount || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Payments that clear every balance. The largest debtor pays the largest creditor until one of
 * them is square, so a group of n players never needs more than n - 1 transfers. The same
 * balances always produce the same transfers.
 */
export const settleUp = (balances: ReadonlyMap<PlayerId, MinorUnits>): ReadonlyArray<Transfer> => {
  const debtors: Array<{ id: PlayerId; amount: number }> = [];
  const creditors: Array<{ id: PlayerId; amount: number }> = [];
  let total = 0;
  for (const [id, balance] of balances) {
    total += balance;
    if (balance < 0) debtors.push({ id, amount: -balance });
    else if (balance > 0) creditors.push({ id, amount: balance });
  }
  if (total !== 0) throw new Error(`Balances must sum to zero, got ${total}`);
  debtors.sort(byAmountThenId);
  creditors.sort(byAmountThenId);

  const transfers: Array<Transfer> = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const debtor = debtors[d]!;
    const creditor = creditors[c]!;
    const amount = Math.min(debtor.amount, creditor.amount);
    transfers.push({ from: debtor.id, to: creditor.id, amount: MinorUnits.make(amount) });
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount === 0) d++;
    if (creditor.amount === 0) c++;
  }
  return transfers;
};

export const leftToSettle = (transfers: ReadonlyArray<Transfer>): MinorUnits =>
  MinorUnits.make(transfers.reduce((sum, transfer) => sum + transfer.amount, 0));
