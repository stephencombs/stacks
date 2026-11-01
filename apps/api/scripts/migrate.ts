import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as PgMigrator from "@effect/sql-pg/PgMigrator";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";

import * as Database from "../src/db/Database.ts";
import { migrations } from "../src/db/migrations/index.ts";

// `--test` targets the integration test database.
const url = process.argv.includes("--test")
  ? (process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/stacks_test")
  : (process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/stacks");

PgMigrator.run({ loader: migrations }).pipe(
  Effect.tap((applied) =>
    Console.log(
      applied.length === 0
        ? "Database is up to date."
        : applied.map(([id, name]) => `Applied ${id}_${name}`).join("\n"),
    ),
  ),
  Effect.provide([Database.layer(url), NodeServices.layer]),
  NodeRuntime.runMain,
);
