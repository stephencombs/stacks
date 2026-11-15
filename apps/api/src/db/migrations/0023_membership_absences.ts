import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/**
 * Rejoining clears a membership's `left_at`, which would lose when the member was away. Each time
 * away is kept here, so play from it never counts for them. Earlier absences weren't recorded.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    create table membership_absences (
      group_id uuid not null,
      user_id text not null,
      left_at timestamptz not null,
      returned_at timestamptz not null,
      foreign key (group_id, user_id) references memberships (group_id, user_id),
      check (returned_at >= left_at)
    )
  `;
  yield* sql`create index membership_absences_member on membership_absences (group_id, user_id)`;
});
