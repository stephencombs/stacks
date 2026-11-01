import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";

import { decodeRows } from "../features/Access.ts";
import type { CatalogVenue } from "./osm.ts";

const BATCH_SIZE = 500;

/**
 * Upserts catalog venues by their source reference. Imported venues count as verified. Rows
 * are never deleted, so sessions keep their venue even after it disappears from the source.
 */
export const importVenues = Effect.fn("Catalog.importVenues")(function* (
  venues: ReadonlyArray<CatalogVenue>,
) {
  const sql = yield* SqlClient.SqlClient;
  const verifiedAt = DateTime.toDateUtc(yield* DateTime.now);
  const unique = Array.from(new Map(venues.map((v) => [`${v.source}:${v.sourceRef}`, v])).values());
  let inserted = 0;
  let updated = 0;
  for (let start = 0; start < unique.length; start += BATCH_SIZE) {
    const batch = unique.slice(start, start + BATCH_SIZE).map((venue) => ({
      id: crypto.randomUUID(),
      ...venue,
      verifiedAt,
    }));
    const rows = yield* sql`
      insert into venues ${sql.insert(batch)}
      on conflict (source, source_ref) do update set
        name = excluded.name, city = excluded.city, region = excluded.region,
        country = excluded.country, lat = excluded.lat, lng = excluded.lng
      returning (xmax = 0) as inserted
    `.pipe(Effect.flatMap(decodeRows(Schema.Struct({ inserted: Schema.Boolean }))));
    for (const row of rows) {
      if (row.inserted) inserted++;
      else updated++;
    }
  }
  return { inserted, updated };
});
