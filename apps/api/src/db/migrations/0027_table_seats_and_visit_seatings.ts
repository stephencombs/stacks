import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/** Adds optional table seat counts and immutable visit seating records. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`alter table tables add column table_seats smallint check (table_seats between 1 and 14)`;
  yield* sql`
    create table personal_seatings (
      id uuid primary key,
      visit_id uuid not null references personal_visits (id),
      seat smallint check (seat between 1 and 14),
      occurred_at timestamptz not null,
      created_by uuid not null,
      created_at timestamptz not null,
      voided_at timestamptz,
      voided_by uuid,
      void_reason text,
      check ((voided_at is null) = (voided_by is null)),
      check (voided_at is not null or void_reason is null),
      check (voided_at is null or voided_at >= created_at)
    )
  `;
  yield* sql`
    create index personal_seatings_visit on personal_seatings (visit_id, occurred_at, created_at, id)
  `;
});
