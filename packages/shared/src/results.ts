import {
  MinorUnits,
  type Entry,
  type PlayerId,
  type Session,
  type SessionId,
} from "@stacks/contracts";

type ResultEntry = Pick<Entry, "kind" | "playerId" | "amount" | "voidedAt">;

export interface PlayerResult {
  readonly buyIn: MinorUnits;
  readonly cashOut: MinorUnits;
  readonly adjustment: MinorUnits;
  /** Cash-outs plus adjustments minus buy-ins: what the player won (positive) or lost. */
  readonly net: MinorUnits;
}

/** Each player's result across the given entries. Voided entries and settlements don't count. */
export const playerResults = (
  entries: Iterable<ResultEntry>,
): ReadonlyMap<PlayerId, PlayerResult> => {
  const totals = new Map<PlayerId, { buyIn: number; cashOut: number; adjustment: number }>();
  for (const entry of entries) {
    if (entry.voidedAt !== null || entry.kind === "settlement") continue;
    const player = totals.get(entry.playerId) ?? { buyIn: 0, cashOut: 0, adjustment: 0 };
    if (entry.kind === "buy_in") player.buyIn += entry.amount;
    else if (entry.kind === "cash_out") player.cashOut += entry.amount;
    else player.adjustment += entry.amount;
    totals.set(entry.playerId, player);
  }

  const results = new Map<PlayerId, PlayerResult>();
  for (const [playerId, { buyIn, cashOut, adjustment }] of totals) {
    results.set(playerId, {
      buyIn: MinorUnits.make(buyIn),
      cashOut: MinorUnits.make(cashOut),
      adjustment: MinorUnits.make(adjustment),
      net: MinorUnits.make(cashOut + adjustment - buyIn),
    });
  }
  return results;
};

/**
 * Splits results by a session property such as game or venue. Only entries from the given
 * sessions count, so pass a filtered session list to scope stats to a date range.
 */
export const resultsBy = <S extends Pick<Session, "id">, K>(
  sessions: Iterable<S>,
  entries: Iterable<ResultEntry & Pick<Entry, "sessionId">>,
  key: (session: S) => K,
): ReadonlyMap<K, ReadonlyMap<PlayerId, PlayerResult>> => {
  const keyBySession = new Map<SessionId, { readonly key: K }>();
  for (const session of sessions) keyBySession.set(session.id, { key: key(session) });

  const grouped = new Map<K, Array<ResultEntry>>();
  for (const entry of entries) {
    const session = entry.sessionId === null ? undefined : keyBySession.get(entry.sessionId);
    if (!session) continue;
    const group = grouped.get(session.key) ?? [];
    group.push(entry);
    grouped.set(session.key, group);
  }

  return new Map(Array.from(grouped, ([groupKey, group]) => [groupKey, playerResults(group)]));
};
