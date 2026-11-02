import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/**
 * Blackjack tables now default to 5 seats. Tables left on the old default of 7 that someone sat
 * past seat 5 at keep their 7 seats.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    update sessions set table_seats = 7
    where table_seats is null and game = 'blackjack'
      and exists (select 1 from seatings st where st.session_id = sessions.id and st.seat > 5)
  `;
});
