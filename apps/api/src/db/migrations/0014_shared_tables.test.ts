import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as PgMigrator from "@effect/sql-pg/PgMigrator";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Migrator from "effect/sql/Migrator";
import * as SqlClient from "effect/sql/SqlClient";

import * as Database from "../Database.ts";
import { records } from "./index.ts";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/stacks_test";

const before = Object.fromEntries(
  Object.entries(records).filter(([name]) => name < "0014"),
) as Partial<typeof records>;

/** A database of its own, migrated through `loader`, dropped when the test ends. */
const scratchDatabase = Effect.gen(function* () {
  const admin = yield* SqlClient.SqlClient;
  const name = `stacks_migration_${crypto.randomUUID().replaceAll("-", "")}`;
  yield* admin.unsafe(`create database ${name}`);
  yield* Effect.addFinalizer(() =>
    admin.unsafe(`drop database if exists ${name} with (force)`).pipe(Effect.orDie),
  );
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  return yield* Layer.build(Database.layer(url.toString()));
});

const uuid = () => crypto.randomUUID();

it.layer(Layer.mergeAll(Database.layer(TEST_DATABASE_URL), NodeServices.layer), {
  timeout: "60 seconds",
})("0014_shared_tables", (it) => {
  it.effect("gives every visit a table and keeps legacy participations read-only", () =>
    Effect.gen(function* () {
      const context = yield* scratchDatabase;
      yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* PgMigrator.run({ loader: Migrator.fromRecord(before) });

        const [player, actor, visit, table, entry, operation] = Array.from({ length: 6 }, uuid);
        const [group, venue, trip, session, guest, participation] = Array.from({ length: 6 }, uuid);
        yield* sql`insert into users (id, display_name) values ('user_ana', 'Ana')`;
        yield* sql`
          insert into players (id, group_id, display_name, user_id, created_by, recording_actor_id)
          values (${player}, null, 'Ana', 'user_ana', 'user_ana', ${actor})
        `;
        yield* sql`
          insert into personal_visits
            (id, player_id, table_id, game, venue_id, high_limit, started_at, finished_at, revision)
          values (${visit}, ${player}, ${table}, 'blackjack', null, true,
            '2026-11-01T20:00:00Z', null, 0)
        `;
        yield* sql`
          insert into personal_entries (id, visit_id, kind, amount, occurred_at, created_by, created_at)
          values (${entry}, ${visit}, 'buy_in', 20000, '2026-11-01T20:00:00Z', ${actor},
            '2026-11-01T20:00:00Z')
        `;
        const command = {
          type: "start",
          operationId: operation,
          actorId: actor,
          preparedAt: "2026-11-01T20:00:00.000Z",
          tableId: table,
          visitId: visit,
          buyInId: entry,
          buyIn: 20000,
          startedAt: "2026-11-01T20:00:00.000Z",
          game: "blackjack",
          venueId: null,
          highLimit: true,
        };
        yield* sql`
          insert into personal_operations (id, player_id, visit_id, command)
          values (${operation}, ${player}, ${visit}, ${JSON.stringify(command)}::jsonb)
        `;
        // A legacy session with one participation, as the import leaves it.
        yield* sql`insert into groups (id, name, currency, created_by) values (${group}, 'Crew', 'USD', 'user_ana')`;
        yield* sql`
          insert into venues (id, name, kind, source) values (${venue}, 'Bellagio', 'casino', 'curated')
        `;
        yield* sql`
          insert into trips (id, group_id, name, started_at, created_by)
          values (${trip}, ${group}, 'Vegas', '2026-01-01T00:00:00Z', 'user_ana')
        `;
        yield* sql`
          insert into sessions (id, group_id, trip_id, venue_id, game, status, started_at, ended_at, created_by)
          values (${session}, ${group}, ${trip}, ${venue}, 'craps', 'closed', '2026-01-01T20:00:00Z',
            '2026-01-01T23:00:00Z', 'user_ana')
        `;
        yield* sql`
          insert into players (id, group_id, display_name, created_by)
          values (${guest}, ${group}, 'Gus', 'user_ana')
        `;
        yield* sql`
          insert into personal_visits (id, player_id, table_id, game, venue_id, high_limit,
            started_at, finished_at, revision, legacy_session_id)
          values (${participation}, ${guest}, ${session}, 'craps', ${venue}, false,
            '2026-01-01T20:00:00Z', '2026-01-01T23:00:00Z', 0, ${session})
        `;

        yield* PgMigrator.run({ loader: Migrator.fromRecord(records) });

        expect(
          yield* sql`
            select id, starter_player_id, game, venue_id, high_limit, legacy_session_id
            from tables order by legacy_session_id nulls first
          `,
        ).toEqual([
          {
            id: table,
            starterPlayerId: player,
            game: "blackjack",
            venueId: null,
            highLimit: true,
            legacySessionId: null,
          },
          {
            id: session,
            starterPlayerId: null,
            game: "craps",
            venueId: venue,
            highLimit: false,
            legacySessionId: session,
          },
        ]);
        expect(
          yield* sql`select id, table_id, player_id from personal_visits order by started_at`,
        ).toEqual([
          { id: participation, tableId: session, playerId: guest },
          { id: visit, tableId: table, playerId: player },
        ]);
        expect(yield* sql`select id, amount::text from personal_entries`).toEqual([
          { id: entry, amount: "20000" },
        ]);
        const [migrated] = yield* sql<{ tableId: string; actorId: string; command: unknown }>`
          select table_id, actor_id, command from personal_operations
        `;
        expect(migrated).toEqual({
          tableId: table,
          actorId: actor,
          command: { ...command, playerId: player },
        });
        expect(yield* sql`select player_id, actor_id from player_actors`).toEqual([
          { playerId: player, actorId: actor },
        ]);
        // A legacy table has no starter, so no actor can ever be authorized to record at it.
        const write = yield* sql`
          update tables set starter_player_id = ${player} where id = ${session}
        `.pipe(Effect.flip);
        expect(write._tag).toBe("SqlError");
      }).pipe(Effect.provide(context));
    }),
  );
});
