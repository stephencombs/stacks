import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    alter table players
      add column venmo text check (venmo ~ '^[A-Za-z0-9_-]{1,30}$'),
      add column cash_app text check (cash_app ~ '^[A-Za-z0-9_-]{1,20}$'),
      add column paypal text check (paypal ~ '^[A-Za-z0-9_-]{1,30}$')
  `;
});
