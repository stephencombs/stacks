import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/** Adds optional multi-spot seat arrays to personal visit seatings. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`alter table personal_seatings add column seats smallint[]`;
  yield* sql`
    alter table personal_seatings add constraint personal_seatings_seats_valid
      check (
        seats is null
        or (
          seat is null
          and cardinality(seats) >= 2
          and seats <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14]::smallint[]
        )
      )
  `;
});
