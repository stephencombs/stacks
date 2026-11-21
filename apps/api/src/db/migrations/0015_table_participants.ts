import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/**
 * Other players join a table through its link, each as a new player bound to their own actor, and
 * record only their own play there.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`set constraints all immediate`;

  yield* sql`
    alter table player_actors
      add column bound_via text not null default 'self' check (bound_via in ('self', 'join'))
  `;
  yield* sql`
    create unique index player_actors_one_self on player_actors (actor_id) where bound_via = 'self'
  `;

  yield* sql`
    create table table_participants (
      table_id uuid not null references tables (id),
      player_id uuid not null unique references players (id),
      joined_via text not null check (joined_via in ('link')),
      joined_at timestamptz not null default now(),
      primary key (table_id, player_id)
    )
  `;
});
