import { MinorUnits, type Entry, type PlayerId } from "@stacks/contracts";

/**
 * One finished visit, as funding stats read it: a player at a session, or one stay at a table.
 * `covered` lists the active buy-ins somebody else paid for; both sides are group player IDs.
 */
export interface VisitFunding {
  readonly playerId: PlayerId;
  /** Active buy-in entries. A correction voids the original, so it counts once. */
  readonly buyIns: number;
  readonly net: number;
  readonly covered: ReadonlyArray<{ readonly payerId: PlayerId; readonly amount: number }>;
}

type FundingEntry = Pick<Entry, "kind" | "playerId" | "counterpartyId" | "amount" | "voidedAt">;

/**
 * The visits of one closed group session: each player with an active entry is one visit. Voided
 * entries don't count, so a pure void drops out.
 */
export const sessionVisits = (entries: Iterable<FundingEntry>) => {
  const visits = new Map<
    PlayerId,
    { buyIns: number; net: number; covered: Array<{ payerId: PlayerId; amount: number }> }
  >();

  for (const entry of entries) {
    if (entry.voidedAt !== null) continue;
    const visit = visits.get(entry.playerId) ?? { buyIns: 0, net: 0, covered: [] };

    if (entry.kind === "buy_in") {
      visit.buyIns += 1;
      visit.net -= entry.amount;

      if (entry.counterpartyId !== null && entry.counterpartyId !== entry.playerId)
        visit.covered.push({ payerId: entry.counterpartyId, amount: entry.amount });
    } else visit.net += entry.amount;

    visits.set(entry.playerId, visit);
  }

  return Array.from(visits, ([playerId, visit]) => ({ playerId, ...visit }) satisfies VisitFunding);
};

/** A finished play with its visits. */
export interface PlayVisits<Id extends string> {
  readonly playId: Id;
  readonly visits: ReadonlyArray<VisitFunding>;
}

/**
 * What `GroupStats` carries about funding, from each finished play's visits: the visits with an
 * additional buy-in, how many visits each play had, and who covered whose buy-ins.
 */
export const fundingOf = <Id extends string>(plays: ReadonlyArray<PlayVisits<Id>>) => ({
  reloads: plays.flatMap(({ playId, visits }) =>
    visits.flatMap((visit) =>
      visit.buyIns > 1
        ? [
            {
              playId,
              playerId: visit.playerId,
              additional: visit.buyIns - 1,
              net: MinorUnits.make(visit.net),
            },
          ]
        : [],
    ),
  ),
  allVisits: plays.flatMap(({ playId, visits }) =>
    visits.length === 0 ? [] : [{ playId, visits: visits.length }],
  ),
  covered: plays.flatMap(({ playId, visits }) =>
    visits.flatMap((visit) =>
      visit.covered.map((entry) => ({
        playId,
        payerId: entry.payerId,
        playerId: visit.playerId,
        amount: MinorUnits.make(entry.amount),
      })),
    ),
  ),
});
