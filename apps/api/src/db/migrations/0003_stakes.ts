import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/** Money one player gives another to play with; see `Stake` in contracts. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    create table stakes (
      id uuid primary key,
      group_id uuid not null references groups (id),
      lender_id uuid not null,
      borrower_id uuid not null,
      amount bigint not null check (amount > 0),
      lender_share smallint not null check (lender_share between 0 and 100),
      started_at timestamptz not null,
      ended_at timestamptz,
      note text check (length(note) <= 280),
      created_by text not null references users (id),
      created_at timestamptz not null default now(),
      voided_at timestamptz,
      voided_by text references users (id),
      void_reason text check (length(void_reason) <= 280),
      foreign key (lender_id, group_id) references players (id, group_id),
      foreign key (borrower_id, group_id) references players (id, group_id),
      check (lender_id <> borrower_id),
      check (ended_at is null or ended_at >= started_at),
      check ((voided_at is null) = (voided_by is null))
    )
  `;
  yield* sql`create index stakes_group on stakes (group_id)`;
});
