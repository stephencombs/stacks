import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/** Whether a session was played at a high-limit table. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`alter table sessions add column high_limit boolean not null default false`;
});
