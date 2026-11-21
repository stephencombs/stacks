import * as PgClient from "@effect/sql-pg/PgClient";
import * as Redacted from "effect/Redacted";
import * as String from "effect/String";

/** Columns are snake_case in Postgres and camelCase in code. */
export const layer = (url: Redacted.Redacted | string) =>
  PgClient.layer({
    url: Redacted.isRedacted(url) ? url : Redacted.make(url),
    transformResultNames: String.snakeToCamel,
    transformQueryNames: String.camelToSnake,
  });
