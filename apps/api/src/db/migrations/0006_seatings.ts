import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/**
 * Who sat where at a table; see `Seating` in contracts. Rows are never edited: a move is a new
 * row and standing up is a row with no seat, so the latest row per player is the table now.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    create table seatings (
      id uuid primary key,
      session_id uuid not null,
      group_id uuid not null,
      player_id uuid not null,
      seat smallint check (seat between 1 and 14),
      occurred_at timestamptz not null,
      created_by text not null references users (id),
      created_at timestamptz not null default now(),
      foreign key (session_id, group_id) references sessions (id, group_id),
      foreign key (session_id, player_id) references session_players (session_id, player_id)
    )
  `;
  yield* sql`create index seatings_session on seatings (session_id, occurred_at)`;
});
