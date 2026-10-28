import * as DateTime from "effect/DateTime";
import {
  MinorUnits,
  type Entry,
  type PlayerId,
  type Session,
  type StakeId,
} from "@stacks/contracts";

import { resultsBy } from "./results.ts";

/** The parts of a stake the math reads. */
export interface StakeTerms {
  readonly id: StakeId;
  readonly lenderId: PlayerId;
  readonly borrowerId: PlayerId;
  readonly amount: MinorUnits;
  /** The lender's cut of winnings, in percent. */
  readonly lenderShare: number;
  readonly startedAt: DateTime.Utc;
  readonly endedAt: DateTime.Utc | null;
  readonly voidedAt: DateTime.Utc | null;
}

export interface StakeOutcome {
  /** The borrower's result that falls to this stake. */
  readonly result: MinorUnits;
  /** What the borrower hands back: the stake plus the lender's cut, or what's left of it. */
  readonly owed: MinorUnits;
}

type ResultEntry = Pick<Entry, "kind" | "playerId" | "amount" | "voidedAt" | "sessionId">;

const covers = (stake: StakeTerms, at: DateTime.Utc) =>
  DateTime.toEpochMillis(stake.startedAt) <= DateTime.toEpochMillis(at) &&
  (stake.endedAt === null || DateTime.toEpochMillis(at) < DateTime.toEpochMillis(stake.endedAt));

/** Splits `total` in proportion to `weights`, in whole units; leftovers go to the largest remainders. */
const allocate = (total: number, weights: ReadonlyArray<number>): ReadonlyArray<number> => {
  const sum = weights.reduce((acc, w) => acc + BigInt(w), 0n);
  const magnitude = BigInt(Math.abs(total));
  const parts = weights.map((w) => (magnitude * BigInt(w)) / sum);
  const remainders = weights.map((w, i) => ({ i, rest: (magnitude * BigInt(w)) % sum }));
  let left = magnitude - parts.reduce((a, b) => a + b, 0n);
  for (const { i } of remainders.toSorted((a, b) =>
    b.rest > a.rest ? 1 : b.rest < a.rest ? -1 : a.i - b.i,
  )) {
    if (left === 0n) break;
    parts[i]! += 1n;
    left -= 1n;
  }
  return parts.map((part) => Number(part) * Math.sign(total));
};

/**
 * Each live stake's share of its borrower's results and what the borrower owes back. A stake
 * covers every session that starts while it's open; when several stakes cover the same
 * session, its result is split by how much each lender put in. Winnings are split at the
 * lender's share; a loss comes out of the stake, and the lender never loses more than it.
 */
export const stakeOutcomes = (
  stakes: Iterable<StakeTerms>,
  sessions: Iterable<Pick<Session, "id" | "startedAt">>,
  entries: Iterable<ResultEntry>,
): ReadonlyMap<StakeId, StakeOutcome> => {
  const live = Array.from(stakes).filter((stake) => stake.voidedAt === null);
  const results = new Map(live.map((stake) => [stake.id, 0]));
  const sessionList = Array.from(sessions);
  const bySession = resultsBy(sessionList, entries, (session) => session.id);

  for (const session of sessionList) {
    const sessionResults = bySession.get(session.id);
    if (!sessionResults) continue;
    for (const [playerId, result] of sessionResults) {
      const open = live.filter((s) => s.borrowerId === playerId && covers(s, session.startedAt));
      if (open.length === 0 || result.net === 0) continue;
      const shares = allocate(
        result.net,
        open.map((s) => s.amount),
      );
      open.forEach((s, i) => results.set(s.id, results.get(s.id)! + shares[i]!));
    }
  }

  return new Map(
    live.map((stake) => {
      const result = results.get(stake.id)!;
      const cut =
        result > 0 ? Number((BigInt(result) * BigInt(stake.lenderShare) + 50n) / 100n) : 0;
      const owed = result >= 0 ? stake.amount + cut : Math.max(0, stake.amount + result);
      return [stake.id, { result: MinorUnits.make(result), owed: MinorUnits.make(owed) }];
    }),
  );
};

/** Balances with each live stake's borrower owing its lender what `stakeOutcomes` worked out. */
export const withStakes = (
  current: ReadonlyMap<PlayerId, MinorUnits>,
  stakes: Iterable<StakeTerms>,
  outcomes: ReadonlyMap<StakeId, StakeOutcome>,
): ReadonlyMap<PlayerId, MinorUnits> => {
  const totals = new Map<PlayerId, number>(current);
  for (const stake of stakes) {
    const outcome = outcomes.get(stake.id);
    if (!outcome || stake.voidedAt !== null) continue;
    totals.set(stake.lenderId, (totals.get(stake.lenderId) ?? 0) + outcome.owed);
    totals.set(stake.borrowerId, (totals.get(stake.borrowerId) ?? 0) - outcome.owed);
  }
  const result = new Map<PlayerId, MinorUnits>();
  for (const [playerId, total] of totals)
    if (total !== 0) result.set(playerId, MinorUnits.make(total));
  return result;
};
