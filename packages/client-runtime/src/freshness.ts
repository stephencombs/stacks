import * as AsyncResult from "effect/reactivity/AsyncResult";

/**
 * How long anything in the atom registry is kept once nothing on screen reads it. It's the
 * registry's default rather than a per-query setting because a query is built on atoms of its own
 * (the request, the client runtime); left at the 400ms default those are torn down between pages
 * and take the cached data with them.
 */
export const CACHE_MS = 5 * 60_000;

/** Data older than this is fetched again when a page mounts or the app wakes. */
export const STALE_MS = 30_000;

/** Several screens reading one query refetch it once, not once each. */
export const DEDUPE_MS = 1_000;

/**
 * Whether a query should refetch now: it has data, isn't already fetching, and that data is stale.
 * A write refetches only the queries on screen, so anything cached from before `ledgerChangedAt`
 * is stale however young it is.
 */
export const shouldRevalidate = <A, E>(
  result: AsyncResult.AsyncResult<A, E>,
  now: number,
  lastRevalidatedAt: number | undefined,
  ledgerChangedAt = 0,
) =>
  AsyncResult.isSuccess(result) &&
  !result.waiting &&
  (now - result.timestamp >= STALE_MS || result.timestamp < ledgerChangedAt) &&
  (lastRevalidatedAt === undefined || now - lastRevalidatedAt >= DEDUPE_MS);

let changedAt = 0;
let ledgerSyncs = 0;
const syncListeners = new Set<() => void>();

/** This client just wrote to the ledger itself; the mutation refetches what's on screen. */
export const ledgerChanged = () => {
  changedAt = Date.now();
};

export const lastLedgerChange = () => changedAt;

/**
 * Changes reached the server by sync rather than a mutation, so nothing refetched what's on
 * screen: a table everyone cashed out of still reads live on Crew until this runs.
 */
export const ledgerSynced = () => {
  ledgerChanged();
  ledgerSyncs += 1;

  for (const listener of syncListeners) listener();
};

export const subscribeLedgerSynced = (listener: () => void) => {
  syncListeners.add(listener);

  return () => void syncListeners.delete(listener);
};

export const ledgerSyncCount = () => ledgerSyncs;
