import * as PgClient from "@effect/sql-pg/PgClient";
import * as Redacted from "effect/Redacted";
import * as String from "effect/String";

/** Columns are snake_case in Postgres and camelCase in code. */
export const layer = (url: Redacted.Redacted | string) =>
  PgClient.layer({
    url: typeof url === "string" ? Redacted.make(url) : url,
    transformResultNames: String.snakeToCamel,
    transformQueryNames: String.camelToSnake,
  });
