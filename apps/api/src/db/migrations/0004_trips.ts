import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/** Named stretches of time in a group; see `Trip` in contracts. Sessions belong by start time. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    create table trips (
      id uuid primary key,
      group_id uuid not null references groups (id),
      name text not null check (length(name) between 1 and 60),
      started_at timestamptz not null,
      ended_at timestamptz,
      created_by text not null references users (id),
      created_at timestamptz not null default now(),
      check (ended_at is null or ended_at >= started_at)
    )
  `;
  yield* sql`create index trips_group on trips (group_id, started_at desc)`;
});
