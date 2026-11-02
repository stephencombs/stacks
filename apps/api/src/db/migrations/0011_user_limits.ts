import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    create table user_limits (
      user_id text primary key references users (id),
      session_reminder_minutes integer check (session_reminder_minutes in (120, 180, 240)),
      updated_at timestamptz not null default now()
    )
  `;
  yield* sql`
    create table trip_user_limits (
      trip_id uuid not null references trips (id) on delete cascade,
      user_id text not null references users (id),
      loss_limit bigint not null check (loss_limit > 0),
      primary key (trip_id, user_id)
    )
  `;
});
