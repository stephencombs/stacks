import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import type { SqlError } from "effect/sql/SqlError";

import * as Database from "../src/db/Database.ts";
import * as LegacyMigration from "../src/features/LegacyMigration.ts";

// Usage: node scripts/legacy-migration.ts preflight
//        node scripts/legacy-migration.ts import [--apply]
// `import` is a dry run that rolls back unless `--apply` is given.
const [command] = process.argv.slice(2);
const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/stacks";

const program: Effect.Effect<
  object,
  LegacyMigration.LegacyBlocked | SqlError,
  SqlClient.SqlClient
> =
  command === "preflight"
    ? LegacyMigration.preflight(null)
    : command === "import"
      ? LegacyMigration.importLegacy({ scope: null, dryRun: !process.argv.includes("--apply") })
      : Effect.die(new Error("Usage: legacy-migration.ts preflight | import [--apply]"));

program.pipe(
  Effect.tap((report) => Console.log(JSON.stringify(report, null, 2))),
  Effect.catchTag("LegacyBlocked", ({ issues }) =>
    Console.error(`Blocked by ${issues.length} issue(s):\n${JSON.stringify(issues, null, 2)}`).pipe(
      Effect.andThen(Effect.die(new Error("Import refused; nothing was written."))),
    ),
  ),
  Effect.provide(Database.layer(url)),
  NodeRuntime.runMain,
);
