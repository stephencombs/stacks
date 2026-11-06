import {
  FinancialContribution,
  PairBalance,
  Repayment,
  VisitRecording,
  type EntryId,
  type PlayEntry,
  type PlayerId,
  type Table,
  type Visit,
} from "@stacks/contracts";

import { checkedMinorUnits } from "./exactMoney.ts";

export interface FinancialRecords {
  readonly tables: Iterable<Table>;
  readonly visits: Iterable<Visit>;
  readonly entries: Iterable<PlayEntry>;
  readonly repayments: Iterable<Repayment>;
}

const uniqueById = <T extends { readonly id: string }>(records: Iterable<T>) => {
  const result = new Map<string, T>();
  for (const record of records) {
    if (result.has(record.id)) throw new RangeError(`Duplicate recording identity: ${record.id}`);
    result.set(record.id, record);
  }
  return result;
};

export const financialContributions = ({
  tables,
  visits,
  entries,
  repayments,
}: FinancialRecords): ReadonlyArray<FinancialContribution> => {
  const tableById = uniqueById(tables);
  const visitById = uniqueById(visits);
  const ids = new Set<EntryId>();
  const result: FinancialContribution[] = [];
  const remember = (id: EntryId) => {
    if (ids.has(id)) throw new RangeError(`Duplicate financial fact: ${id}`);
    ids.add(id);
  };

  for (const entry of entries) {
    remember(entry.id);
    const visit = visitById.get(entry.visitId);
    if (!visit) throw new RangeError(`Missing visit: ${entry.visitId}`);
    const table = tableById.get(visit.tableId);
    if (!table) throw new RangeError(`Missing table: ${visit.tableId}`);
    VisitRecording.make({ visit, entries: [entry] });
    if (
      entry.voidedAt !== null ||
      entry.counterpartyId === null ||
      entry.amount === 0 ||
      entry.kind === "adjustment"
    )
      continue;
    result.push(
      FinancialContribution.make({
        debtorId: entry.kind === "buy_in" ? visit.playerId : entry.counterpartyId,
        creditorId: entry.kind === "buy_in" ? entry.counterpartyId : visit.playerId,
        amount: entry.amount,
        source: {
          kind: "play",
          entryId: entry.id,
          visitId: visit.id,
          tableId: table.id,
          tripId: table.tripId,
        },
      }),
    );
  }
  for (const repayment of repayments) {
    Repayment.make(repayment);
    remember(repayment.id);
    if (repayment.voidedAt !== null) continue;
    result.push(
      FinancialContribution.make({
        debtorId: repayment.toPlayerId,
        creditorId: repayment.fromPlayerId,
        amount: repayment.amount,
        source: {
          kind: "repayment",
          entryId: repayment.id,
          recordedFromTripId: repayment.recordedFromTripId,
        },
      }),
    );
  }
  return result;
};

/** Only opposite obligations between the same two players cancel. */
export const pairBalances = (
  contributions: Iterable<FinancialContribution>,
): ReadonlyArray<PairBalance> => {
  const pairs = new Map<PlayerId, Map<PlayerId, bigint>>();
  for (const contribution of contributions) {
    const { debtorId, creditorId, amount } = FinancialContribution.make(contribution);
    const [first, second] = debtorId < creditorId ? [debtorId, creditorId] : [creditorId, debtorId];
    const row = pairs.get(first) ?? new Map<PlayerId, bigint>();
    row.set(
      second,
      (row.get(second) ?? 0n) + (first === debtorId ? BigInt(amount) : -BigInt(amount)),
    );
    pairs.set(first, row);
  }
  const result: PairBalance[] = [];
  for (const [first, row] of pairs) {
    for (const [second, amount] of row) {
      if (amount === 0n) continue;
      result.push({
        debtorId: amount > 0n ? first : second,
        creditorId: amount > 0n ? second : first,
        amount: checkedMinorUnits(amount > 0n ? amount : -amount),
      });
    }
  }
  return result.sort((a, b) =>
    a.debtorId < b.debtorId
      ? -1
      : a.debtorId > b.debtorId
        ? 1
        : a.creditorId < b.creditorId
          ? -1
          : a.creditorId > b.creditorId
            ? 1
            : 0,
  );
};
