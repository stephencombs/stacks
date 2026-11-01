import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as NodeFS from "node:fs/promises";

import { importVenues } from "../src/catalog/importVenues.ts";
import { OVERPASS_QUERY, OverpassResponse, curatedOnline, fromOsm } from "../src/catalog/osm.ts";
import * as Database from "../src/db/Database.ts";

// Usage: node scripts/import-venues.ts [--file overpass.json]
// Without --file, casinos are fetched from the Overpass API (OVERPASS_URL to use a mirror).
const fileFlag = process.argv.indexOf("--file");
const file = fileFlag === -1 ? undefined : process.argv[fileFlag + 1];
const overpassUrl = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/stacks";

const loadOverpass = Effect.tryPromise(async () => {
  if (file) return JSON.parse(await NodeFS.readFile(file, "utf8")) as unknown;
  const response = await fetch(overpassUrl, {
    method: "POST",
    body: new URLSearchParams({ data: OVERPASS_QUERY }),
  });
  if (!response.ok) throw new Error(`Overpass answered ${response.status}`);
  return (await response.json()) as unknown;
});

Effect.gen(function* () {
  const overpass = yield* Schema.decodeUnknownEffect(OverpassResponse)(yield* loadOverpass);
  const casinos = overpass.elements.map(fromOsm).filter((venue) => venue !== null);
  const result = yield* importVenues([...casinos, ...curatedOnline]);
  yield* Console.log(
    `Imported ${casinos.length} casinos and ${curatedOnline.length} online casinos: ` +
      `${result.inserted} new, ${result.updated} updated.`,
  );
}).pipe(Effect.provide(Database.layer(url)), NodeRuntime.runMain);
