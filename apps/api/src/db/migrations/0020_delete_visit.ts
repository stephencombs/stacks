import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`alter table personal_visits add column deleted_at timestamptz`;
  yield* sql`drop index personal_visits_one_open`;
  yield* sql`create unique index personal_visits_one_open on personal_visits (table_id, player_id)
    where finished_at is null and deleted_at is null`;
});
