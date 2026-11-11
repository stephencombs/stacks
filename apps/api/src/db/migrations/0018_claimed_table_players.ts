import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/**
 * An account can claim the table players its devices and invites hold, so a table player may carry
 * a `user_id` without being the account's personal player. Only the personal player has a
 * recording actor, so that is what stays unique per account.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`alter table players drop constraint players_kind`;
  yield* sql`
    alter table players add constraint players_kind check (
      (group_id is not null and recording_actor_id is null and created_by is not null)
      or (group_id is null and user_id is not null and recording_actor_id is not null)
      or (group_id is null and recording_actor_id is null and created_by_actor is not null)
    )
  `;
  yield* sql`drop index players_one_personal`;
  yield* sql`
    create unique index players_one_personal on players (user_id) where recording_actor_id is not null
  `;
  yield* sql`
    create index players_claimed on players (user_id) where group_id is null and user_id is not null
  `;
});
