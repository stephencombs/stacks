import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/**
 * A table becomes its own record, run by the player who started it, so other players' visits can
 * join it. Signed-out devices record as actors that prove themselves with a secret.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // The server keeps a hash of a device actor's secret, never the secret.
  yield* sql`
    create table recording_actors (
      id uuid primary key,
      secret_hash text not null,
      created_at timestamptz not null default now()
    )
  `;
  // Who an actor records as. An account's actor is its personal player's `recording_actor_id`,
  // which has no secret, so this doesn't reference recording_actors.
  yield* sql`
    create table player_actors (
      player_id uuid not null references players (id),
      actor_id uuid not null,
      primary key (player_id, actor_id)
    )
  `;
  yield* sql`create index player_actors_actor on player_actors (actor_id)`;
  yield* sql`
    insert into player_actors (player_id, actor_id)
    select id, recording_actor_id from players where recording_actor_id is not null
  `;

  // A table player belongs to no group or account: someone added them at a table by name.
  yield* sql`alter table players add column created_by_actor uuid`;
  yield* sql`alter table players alter column created_by drop not null`;
  yield* sql`alter table players drop constraint players_personal`;
  yield* sql`
    alter table players add constraint players_kind check (
      (group_id is not null and recording_actor_id is null and created_by is not null)
      or (group_id is null and user_id is not null and recording_actor_id is not null)
      or (group_id is null and user_id is null and recording_actor_id is null
        and created_by_actor is not null)
    )
  `;

  // Game, venue and high limit describe the table, so they move from the visit to it. A legacy
  // session's table has no starter: its participations stay read-only.
  yield* sql`
    create table tables (
      id uuid primary key,
      starter_player_id uuid references players (id),
      game game,
      venue_id uuid,
      high_limit boolean not null,
      legacy_session_id uuid unique references sessions (id),
      share_token_hash text unique,
      check ((starter_player_id is null) = (legacy_session_id is not null))
    )
  `;
  yield* sql`create index tables_starter on tables (starter_player_id)`;
  yield* sql`
    insert into tables (id, starter_player_id, game, venue_id, high_limit, legacy_session_id)
    select distinct on (table_id) table_id,
      case when legacy_session_id is null then player_id end,
      game, venue_id, high_limit, legacy_session_id
    from personal_visits
    order by table_id, started_at, id
  `;
  yield* sql`
    alter table personal_visits
      add constraint personal_visits_table foreign key (table_id) references tables (id),
      drop column game,
      drop column venue_id,
      drop column high_limit
  `;
  yield* sql`drop index personal_visits_native_table`;
  yield* sql`create index personal_visits_table on personal_visits (table_id)`;
  // A player who leaves and comes back has a new visit; only one of them can be open.
  yield* sql`
    create unique index personal_visits_one_open on personal_visits (table_id, player_id)
    where finished_at is null
  `;

  // Each operation is kept per table and per actor. Starts name their player now.
  yield* sql`alter table personal_operations add column table_id uuid references tables (id)`;
  yield* sql`alter table personal_operations add column actor_id uuid`;
  yield* sql`
    update personal_operations o
    set table_id = v.table_id, actor_id = (o.command ->> 'actorId')::uuid,
      command = case when o.command ->> 'type' in ('start', 'record_completed')
        then o.command || jsonb_build_object('playerId', v.player_id) else o.command end
    from personal_visits v
    where v.id = o.visit_id
  `;
  yield* sql`
    alter table personal_operations
      alter column table_id set not null,
      alter column actor_id set not null
  `;
  yield* sql`create index personal_operations_table on personal_operations (table_id, seq)`;
});
