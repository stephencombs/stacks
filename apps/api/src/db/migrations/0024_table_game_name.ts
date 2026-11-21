import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/** Stores a custom name when a table's game is `"other"`. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`alter table tables add column game_name text`;
});
