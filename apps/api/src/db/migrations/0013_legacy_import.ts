import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/**
 * Room for legacy play in the new model; `features/LegacyMigration.ts` fills it. A legacy session
 * can't show where each player's visits began and ended, so each player's part in it becomes one
 * historical participation: a `personal_visits` row marked by `legacy_session_id`, sharing the
 * session's ID as its table.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`alter table personal_visits add column legacy_session_id uuid references sessions (id)`;
  yield* sql`
    alter table personal_visits add constraint personal_visits_legacy_participation
      unique (legacy_session_id, player_id)
  `;
  yield* sql`alter table personal_visits drop constraint personal_visits_table_id_key`;
  yield* sql`
    create unique index personal_visits_native_table on personal_visits (table_id)
    where legacy_session_id is null
  `;
  yield* sql`alter table personal_entries add column counterparty_id uuid references players (id)`;
  yield* sql`
    create table repayments (
      id uuid primary key,
      from_player_id uuid not null references players (id),
      to_player_id uuid not null references players (id),
      amount bigint not null check (amount > 0),
      occurred_at timestamptz not null,
      note text,
      recorded_from_trip_id uuid references trips (id),
      created_by uuid not null,
      created_at timestamptz not null,
      voided_at timestamptz,
      voided_by uuid,
      void_reason text,
      replaces_entry_id uuid references repayments (id),
      check (from_player_id <> to_player_id),
      check ((voided_at is null) = (voided_by is null))
    )
  `;
  yield* sql`create index repayments_from on repayments (from_player_id)`;
  yield* sql`create index repayments_to on repayments (to_player_id)`;
});
