import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/**
 * Payments between two players belong to their pair, not a table: each pair's commands are one
 * stream in the operation log, keyed by its two players in order.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    alter table personal_operations
      alter column table_id drop not null,
      add column pair_first_player_id uuid references players (id),
      add column pair_second_player_id uuid references players (id),
      add constraint personal_operations_stream check (
        (table_id is null) = (pair_first_player_id is not null)
        and (pair_first_player_id is null) = (pair_second_player_id is null)
        and (pair_first_player_id is null or pair_first_player_id < pair_second_player_id)
      )
  `;
  yield* sql`
    create index personal_operations_pair
    on personal_operations (pair_first_player_id, pair_second_player_id, seq)
    where pair_first_player_id is not null
  `;
  yield* sql`
    create index personal_entries_counterparty on personal_entries (counterparty_id)
    where counterparty_id is not null
  `;
});
