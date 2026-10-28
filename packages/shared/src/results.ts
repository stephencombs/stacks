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

/** Whose results a view shows: one player, or everyone in the group added together. */
export type Subject = PlayerId | "group";

/** A subject's net across `results`, or undefined when nobody they cover has a result there. */
export const netFor = (
  results: ReadonlyArray<{ readonly playerId: PlayerId; readonly net: MinorUnits }>,
  subject: Subject,
): MinorUnits | undefined => {
  if (subject !== "group") return results.find((r) => r.playerId === subject)?.net;
  if (results.length === 0) return undefined;
  return MinorUnits.make(results.reduce((total, r) => total + r.net, 0));
};

/**
 * A subject's result in each session they played, with the running total after it. Pass the
 * sessions oldest first; sessions the subject sat out are skipped.
 */
export const runningNet = <
  S extends {
    readonly results: ReadonlyArray<{ readonly playerId: PlayerId; readonly net: MinorUnits }>;
  },
>(
  sessions: Iterable<S>,
  subject: Subject,
): ReadonlyArray<{ readonly session: S; readonly net: MinorUnits; readonly total: MinorUnits }> => {
  const points: Array<{ session: S; net: MinorUnits; total: MinorUnits }> = [];
  let total = 0;
  for (const session of sessions) {
    const net = netFor(session.results, subject);
    if (net === undefined) continue;
    total += net;
    points.push({ session, net, total: MinorUnits.make(total) });
  }
  return points;
};

/** How many of the given sessions each player has a result in. */
export const sessionCounts = (
  sessions: Iterable<{ readonly results: ReadonlyArray<{ readonly playerId: PlayerId }> }>,
): ReadonlyMap<PlayerId, number> => {
  const counts = new Map<PlayerId, number>();
  for (const session of sessions)
    for (const { playerId } of session.results)
      counts.set(playerId, (counts.get(playerId) ?? 0) + 1);
  return counts;
};

export interface SessionRuns {
  readonly sessions: number;
  /** Sessions that finished up. */
  readonly wins: number;
  readonly longestWinningRun: number;
  /** The run of wins or losses the latest session belongs to; an even session ends any run. */
  readonly current: { readonly length: number; readonly winning: boolean };
}

/** Wins and streaks over one player's session results, oldest first. */
export const sessionRuns = (nets: Iterable<number>): SessionRuns => {
  let sessions = 0;
  let wins = 0;
  let longestWinningRun = 0;
  let winning = 0;
  let length = 0;
  let sign = 0;
  for (const net of nets) {
    sessions += 1;
    if (net > 0) wins += 1;
    winning = net > 0 ? winning + 1 : 0;
    longestWinningRun = Math.max(longestWinningRun, winning);
    const next = Math.sign(net);
    length = next === 0 ? 0 : next === sign ? length + 1 : 1;
    sign = next;
  }
  return { sessions, wins, longestWinningRun, current: { length, winning: sign > 0 } };
};
