import * as DateTime from "effect/DateTime";
import { VisitRecording, type PlayEntry, type Visit, type VisitSummary } from "@stacks/contracts";

import { checkedMinorUnits } from "./exactMoney.ts";

const entriesFor = (visit: Visit, entries: Iterable<PlayEntry>) =>
  VisitRecording.make({
    visit,
    entries: Array.from(entries).filter((entry) => entry.visitId === visit.id),
  }).entries;

const summarize = (visit: Visit, entries: Iterable<PlayEntry>): VisitSummary => {
  let buyIn = 0n;
  let cashOut = 0n;
  let adjustment = 0n;
  for (const entry of entries) {
    if (entry.voidedAt !== null) continue;
    if (entry.kind === "buy_in") buyIn += BigInt(entry.amount);
    else if (entry.kind === "cash_out") cashOut += BigInt(entry.amount);
    else adjustment += BigInt(entry.amount);
  }
  return {
    visit,
    totals: {
      buyIn: checkedMinorUnits(buyIn),
      cashOut: checkedMinorUnits(cashOut),
      adjustment: checkedMinorUnits(adjustment),
    },
    finalResult: visit.finishedAt === null ? null : checkedMinorUnits(cashOut + adjustment - buyIn),
  };
};

export const visitSummary = (visit: Visit, entries: Iterable<PlayEntry>): VisitSummary =>
  summarize(visit, entriesFor(visit, entries));

export interface VisitProjection {
  readonly summary: VisitSummary;
  readonly entries: ReadonlyArray<PlayEntry>;
}

export const projectVisit = (visit: Visit, entries: Iterable<PlayEntry>): VisitProjection => {
  const history = entriesFor(visit, entries).toSorted(
    (a, b) =>
      DateTime.toEpochMillis(a.occurredAt) - DateTime.toEpochMillis(b.occurredAt) ||
      DateTime.toEpochMillis(a.createdAt) - DateTime.toEpochMillis(b.createdAt) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return { summary: summarize(visit, history), entries: history };
};
