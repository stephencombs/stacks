import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/** How many seats a session's table has; null is the game's usual table. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`alter table sessions add column table_seats smallint check (table_seats between 1 and 14)`;
});
