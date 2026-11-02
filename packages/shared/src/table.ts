import type { Entry, PlayerId } from "@stacks/contracts";

type TableEntry = Pick<Entry, "kind" | "playerId" | "amount" | "counterpartyId" | "voidedAt">;

/**
 * Amounts to offer for a buy-in, most likely first: what this player last bought in for, what
 * the table usually buys in for, and double their last. Money someone else put up counts too,
 * since it's still the size of the buy-in. At most three, no repeats.
 */
export const buyInPresets = (
  entries: ReadonlyArray<TableEntry>,
  playerId: PlayerId,
): ReadonlyArray<number> => {
  const buyIns = entries.filter((e) => e.kind === "buy_in" && e.voidedAt === null);
  const last = buyIns.findLast((e) => e.playerId === playerId)?.amount;
  const counts = new Map<number, number>();
  for (const { amount } of buyIns) counts.set(amount, (counts.get(amount) ?? 0) + 1);
  // Ties go to the bigger amount: tables move up, not down.
  const usual = [...counts].toSorted((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0];
  const offers = [last, usual, last === undefined ? undefined : last * 2].filter(
    (amount): amount is number => amount !== undefined && amount > 0,
  );
  return [...new Set(offers)].slice(0, 3);
};
