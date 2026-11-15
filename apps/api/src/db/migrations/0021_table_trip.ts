import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`alter table tables add column trip_id uuid references trips(id)`;
  yield* sql`create index tables_trip on tables (trip_id) where trip_id is not null`;
});
