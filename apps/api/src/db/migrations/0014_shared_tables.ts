import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/**
 * A table becomes its own record, run by the player who started it, so other players' visits can
 * join it. Signed-out devices record as actors that prove themselves with a secret.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // Every actor, in one namespace, so an ID can't be both an account's and a device's. A device
  // actor proves itself with a secret, whose hash the server keeps; an account actor has none and
  // is reached only through the account's session. Actor IDs are public (they sign entries).
  yield* sql`
    create table recording_actors (
      id uuid primary key,
      kind text not null check (kind in ('account', 'device')),
      secret_hash text,
      created_at timestamptz not null default now(),
      unique (id, kind),
      check ((kind = 'device') = (secret_hash is not null))
    )
  `;
  yield* sql`
    insert into recording_actors (id, kind)
    select recording_actor_id, 'account' from players where recording_actor_id is not null
  `;
  // A personal player's actor must be an account actor. Deferred, so a player and its actor can
  // be created in either order inside one transaction.
  yield* sql`
    alter table players
      add column recording_actor_kind text
        generated always as (case when recording_actor_id is not null then 'account' end) stored,
      add constraint players_account_actor
        foreign key (recording_actor_id, recording_actor_kind)
        references recording_actors (id, kind) deferrable initially deferred
  `;
  // Who an actor records as.
  yield* sql`
    create table player_actors (
      player_id uuid not null references players (id),
      actor_id uuid not null references recording_actors (id) deferrable initially deferred,
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
    set table_id = v.table_id,
      actor_id = coalesce((o.command ->> 'actorId')::uuid, p.recording_actor_id),
      command = case when o.command ->> 'type' in ('start', 'record_completed')
        then o.command || jsonb_build_object('playerId', v.player_id) else o.command end
    from personal_visits v, players p
    where v.id = o.visit_id and p.id = o.player_id
  `;
  // An operation is written with its visit in one transaction, so none should lack one. Stop with
  // the rows named rather than guess a table for them.
  const orphans = yield* sql<{ id: string }>`
    select id from personal_operations where table_id is null or actor_id is null order by seq
  `;
  if (orphans.length > 0)
    return yield* Effect.die(
      new Error(
        `0014_shared_tables: personal_operations without a visit or actor: ${orphans
          .map((row) => row.id)
          .join(", ")}`,
      ),
    );
  yield* sql`
    alter table personal_operations
      alter column table_id set not null,
      alter column actor_id set not null
  `;
  yield* sql`create index personal_operations_table on personal_operations (table_id, seq)`;
});
