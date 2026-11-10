import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/**
 * A personal invite binds another actor to one player, and a binding can be revoked. The starter
 * appoints recorders through commands in the table's stream, so they have no visit.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    alter table player_actors
      add column revoked_at timestamptz,
      drop constraint player_actors_bound_via_check,
      add constraint player_actors_bound_via_check
        check (bound_via in ('self', 'join', 'invite')),
      add constraint player_actors_self_stays check (bound_via <> 'self' or revoked_at is null)
  `;
  yield* sql`
    create table player_invites (
      id uuid primary key,
      player_id uuid not null references players (id),
      token_hash text not null unique,
      issued_by_actor uuid not null references recording_actors (id),
      created_at timestamptz not null default now(),
      redeemed_at timestamptz,
      revoked_at timestamptz,
      check (redeemed_at is null or revoked_at is null)
    )
  `;
  yield* sql`create index player_invites_player on player_invites (player_id)`;
  yield* sql`alter table personal_operations alter column visit_id drop not null`;
});
