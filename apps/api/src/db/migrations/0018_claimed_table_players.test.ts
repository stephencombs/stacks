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
  Object.entries(records).filter(([name]) => name < "0018"),
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
})("0018_claimed_table_players", (it) => {
  it.effect("backfills the owner of players an account's actor already held, and only then", () =>
    Effect.gen(function* () {
      const context = yield* scratchDatabase;
      yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* PgMigrator.run({ loader: Migrator.fromRecord(before) });

        const [anaActor, beaActor, strayActor, deviceActor] = [uuid(), uuid(), uuid(), uuid()];
        const [anaPlayer, beaPlayer] = [uuid(), uuid()];
        const [mine, both, revoked, deviceOnly, stray, mixed] = [
          uuid(),
          uuid(),
          uuid(),
          uuid(),
          uuid(),
          uuid(),
        ];

        for (const user of ["ana", "bea"])
          yield* sql`insert into users (id, display_name) values (${`user_${user}`}, ${user})`;
        for (const actor of [anaActor, beaActor, strayActor])
          yield* sql`insert into recording_actors (id, kind) values (${actor}, 'account')`;
        yield* sql`
          insert into recording_actors (id, kind, secret_hash) values (${deviceActor}, 'device', 'x')
        `;
        // Each account's personal player, and the actor it records as.
        for (const [player, user, actor] of [
          [anaPlayer, "user_ana", anaActor],
          [beaPlayer, "user_bea", beaActor],
        ] as const) {
          yield* sql`
            insert into players (id, group_id, display_name, user_id, created_by, recording_actor_id)
            values (${player}, null, ${user}, ${user}, ${user}, ${actor})
          `;
          yield* sql`insert into player_actors (player_id, actor_id) values (${player}, ${actor})`;
        }
        // Table players: nobody's `user_id` is set, as before this migration.
        for (const player of [mine, both, revoked, deviceOnly, stray, mixed])
          yield* sql`
            insert into players (id, display_name, created_by_actor) values (${player}, 'Guest', ${deviceActor})
          `;
        const bind = (player: string, actor: string, revokedAt: string | null = null) =>
          sql`
            insert into player_actors (player_id, actor_id, bound_via, revoked_at)
            values (${player}, ${actor}, 'join', ${revokedAt})
          `;
        yield* bind(mine, anaActor);
        yield* bind(both, anaActor);
        yield* bind(both, beaActor);
        yield* bind(revoked, anaActor, "2026-11-01T00:00:00Z");
        yield* bind(deviceOnly, deviceActor);
        yield* bind(stray, strayActor);
        yield* bind(mixed, anaActor);
        yield* bind(mixed, deviceActor);

        yield* PgMigrator.run({ loader: Migrator.fromRecord(records) });

        const owners = Object.fromEntries(
          (yield* sql<{ id: string; userId: string | null }>`select id, user_id from players`).map(
            (row) => [row.id, row.userId],
          ),
        );
        // One account's actor holds it, live: it is that account's.
        expect(owners[mine]).toBe("user_ana");
        expect(owners[mixed]).toBe("user_ana");
        // Two accounts hold it: nobody is told it's theirs, so it stays open to claims.
        expect(owners[both]).toBeNull();
        // A revoked binding, a device alone, and an account actor with no player prove nothing.
        expect(owners[revoked]).toBeNull();
        expect(owners[deviceOnly]).toBeNull();
        expect(owners[stray]).toBeNull();
        // The personal players are untouched, and still one per account.
        expect(owners[anaPlayer]).toBe("user_ana");
        expect(owners[beaPlayer]).toBe("user_bea");
        expect(
          yield* sql`select user_id from players where recording_actor_id is not null`,
        ).toHaveLength(2);
      }).pipe(Effect.provide(context));
    }),
  );
});
