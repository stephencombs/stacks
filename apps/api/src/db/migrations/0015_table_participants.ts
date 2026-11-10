import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/**
 * Other players join a table through its link, each as a new player bound to their own actor, and
 * record only their own play there.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  // Run with 0014 in one transaction, its deferred checks would block altering player_actors.
  yield* sql`set constraints all immediate`;

  // An actor records as its own player ('self', one per actor) and as each player it joined a
  // table as ('join'). Only its own player starts tables or is claimed by an account.
  yield* sql`
    alter table player_actors
      add column bound_via text not null default 'self' check (bound_via in ('self', 'join'))
  `;
  yield* sql`
    create unique index player_actors_one_self on player_actors (actor_id) where bound_via = 'self'
  `;

  // Joining is the access path: a participant sees the table, and records its player's play there.
  // A revoked link stops new joins; these rows keep working.
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
