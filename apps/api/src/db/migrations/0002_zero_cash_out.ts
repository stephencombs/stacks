import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/** A bust is a zero cash-out; only buy-ins and settlements must be positive. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`alter table entries drop constraint entries_check2`;
  yield* sql`
    alter table entries add constraint entries_amount_by_kind check (
      case kind
        when 'settlement' then session_id is null and counterparty_id is not null and amount > 0
        when 'adjustment' then session_id is not null and counterparty_id is null and amount <> 0
        when 'cash_out' then session_id is not null and amount >= 0
        else session_id is not null and amount > 0
      end
    )
  `;
});
