import * as AsyncResult from "effect/reactivity/AsyncResult";

/**
 * Query freshness, the way TanStack Query does it: data stays cached for a while after nothing
 * shows it, a page that comes back shows what it had at once, and data older than `STALE_MS` is
 * fetched again in the background while the old copy stays on screen.
 */

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
 * Whether a query should refetch on mount or wake: it failed, or its data is stale.
 * A write refetches only the queries on screen, so anything cached from before `ledgerChangedAt`
 * is stale however young it is.
 */
export const shouldRevalidate = <A, E>(
  result: AsyncResult.AsyncResult<A, E>,
  now: number,
  lastRevalidatedAt: number | undefined,
  ledgerChangedAt = 0,
) =>
  !result.waiting &&
  (AsyncResult.isFailure(result) ||
    (AsyncResult.isSuccess(result) &&
      (now - result.timestamp >= STALE_MS || result.timestamp < ledgerChangedAt))) &&
  (lastRevalidatedAt === undefined || now - lastRevalidatedAt >= DEDUPE_MS);
