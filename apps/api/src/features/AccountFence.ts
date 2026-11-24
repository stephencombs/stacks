import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as SqlClient from "effect/sql/SqlClient";
import { Unauthorized } from "@stacks/contracts";

/** The user every audit column of a deleted account names. It can never sign in. */
export const DELETED_USER = "deleted-account";

/** The unbound recording actor that stands in for a deleted account's. */
export const DELETED_ACTOR = "00000000-0000-4000-8000-000000000000";

/** What `account_deletions` keeps of a user: a hash, so the fence holds no identity. */
export const hashOf = (userId: string) =>
  Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId))).pipe(
    Effect.map((hash) => Buffer.from(hash).toString("hex")),
  );

const isFenced = Effect.fn("AccountFence.isFenced")(function* (userId: string) {
  const sql = yield* SqlClient.SqlClient;

  const rows =
    yield* sql`select 1 from account_deletions where user_id_hash = ${yield* hashOf(userId)}`;

  return rows.length > 0;
});

/** Rejects a token whose subject was deleted. */
export const reject = Effect.fn("AccountFence.reject")(function* (userId: string) {
  if (yield* isFenced(userId)) return yield* new Unauthorized({ reason: "account_deleted" });
});

/**
 * Rejects a token whose subject was deleted, from a place that can't ask for the database in its
 * type: authentication middleware. The Worker provides the request's database to the whole
 * request, so it is read from the context at run time.
 */
export const rejectInRequest = Effect.fn("AccountFence.rejectInRequest")(function* (
  userId: string,
) {
  const sql = Context.getOption(yield* Effect.context<never>(), SqlClient.SqlClient);

  if (Option.isNone(sql)) return yield* Effect.die("No database in the request context");

  yield* reject(userId).pipe(
    Effect.provideService(SqlClient.SqlClient, sql.value),
    Effect.catchTag("SqlError", Effect.die),
  );
});

/**
 * Waits for a deletion of the user in flight, and holds off a new one until the transaction ends.
 * A write that can re-create the user takes it before checking the fence.
 */
export const lockShared = Effect.fn("AccountFence.lockShared")(function* (userId: string) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`select pg_advisory_xact_lock_shared(hashtextextended(${userId}, 0))`;
});

/** `Account.delete` alone holds this: no write of the user's runs beside it. */
export const lockExclusive = Effect.fn("AccountFence.lockExclusive")(function* (userId: string) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
});
