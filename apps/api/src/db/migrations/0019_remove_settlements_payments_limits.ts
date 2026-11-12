import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/** Drops settlements, repayments, payment handles and loss limits along with their data. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  // The append-only trigger refuses deletes; settlements go with the feature.
  yield* sql`alter table entries disable trigger entries_append_only`;
  yield* sql`delete from entries where kind = 'settlement'`;
  yield* sql`alter table entries enable trigger entries_append_only`;
  yield* sql`alter table entries drop constraint entries_trip_for_settlements`;
  yield* sql`alter table entries drop column trip_id`;
  yield* sql`drop table repayments`;
  yield* sql`delete from personal_operations where pair_first_player_id is not null`;
  yield* sql`drop index personal_operations_pair`;
  yield* sql`alter table personal_operations drop constraint personal_operations_stream`;
  yield* sql`
    alter table personal_operations
      drop column pair_first_player_id,
      drop column pair_second_player_id,
      alter column table_id set not null
  `;
  yield* sql`alter table players drop column venmo, drop column cash_app, drop column paypal`;
  yield* sql`drop table trip_user_limits`;
  yield* sql`drop table user_limits`;
});
