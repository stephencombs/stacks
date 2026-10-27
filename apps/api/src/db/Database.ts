import * as PgClient from "@effect/sql-pg/PgClient";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as String from "effect/String";

/** Columns are snake_case in Postgres and camelCase in code. */
export const layer = (url: Redacted.Redacted | string) =>
  PgClient.layer({
    url: typeof url === "string" ? Redacted.make(url) : url,
    transformResultNames: String.snakeToCamel,
    transformQueryNames: String.camelToSnake,
  });

export const layerConfig = Layer.unwrap(
  Effect.map(Config.Redacted("DATABASE_URL"), (url) => layer(url)),
);
