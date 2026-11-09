import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  // An account's personal player is a players row outside any group. Its ID and actor come from
  // the first device that synced, so that device's history needs no rewriting.
  yield* sql`alter table players alter column group_id drop not null`;
  yield* sql`alter table players add column recording_actor_id uuid unique`;
  yield* sql`
    alter table players add constraint players_personal check (
      (group_id is null) = (recording_actor_id is not null)
      and (group_id is not null or user_id is not null)
    )
  `;
  yield* sql`create unique index players_one_personal on players (user_id) where group_id is null`;

  // Until shared tables exist, a personal visit carries its own one-visit table.
  yield* sql`
    create table personal_visits (
      id uuid primary key,
      player_id uuid not null references players (id),
      table_id uuid not null unique,
      game game,
      -- Recorded offline against the device's venue list, so the catalog can't vouch for it yet.
      venue_id uuid,
      high_limit boolean not null,
      started_at timestamptz not null,
      finished_at timestamptz,
      revision integer not null check (revision >= 0),
      check (finished_at is null or finished_at >= started_at)
    )
  `;
  yield* sql`create index personal_visits_player on personal_visits (player_id)`;
  yield* sql`create type play_entry_kind as enum ('buy_in', 'cash_out', 'adjustment')`;
  yield* sql`
    create table personal_entries (
      id uuid primary key,
      visit_id uuid not null references personal_visits (id),
      kind play_entry_kind not null,
      amount bigint not null,
      occurred_at timestamptz not null,
      note text,
      created_by uuid not null,
      created_at timestamptz not null,
      voided_at timestamptz,
      voided_by uuid,
      void_reason text,
      replaces_entry_id uuid references personal_entries (id),
      check ((voided_at is null) = (voided_by is null))
    )
  `;
  yield* sql`create index personal_entries_visit on personal_entries (visit_id)`;
  // The applied command log: the idempotency key, and each visit's history for the next command.
  yield* sql`
    create table personal_operations (
      id uuid primary key,
      seq bigint generated always as identity unique,
      player_id uuid not null references players (id),
      visit_id uuid not null,
      command jsonb not null,
      applied_at timestamptz not null default now()
    )
  `;
  yield* sql`create index personal_operations_visit on personal_operations (visit_id, seq)`;
});
