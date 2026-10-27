import * as Schema from "effect/Schema";

const Coordinates = Schema.Struct({ lat: Schema.Finite, lon: Schema.Finite });

/** The parts of an Overpass `out center tags` response the import reads. */
export const OverpassResponse = Schema.Struct({
  elements: Schema.Array(
    Schema.Struct({
      type: Schema.Literals(["node", "way", "relation"]),
      id: Schema.Int,
      lat: Schema.optionalKey(Schema.Finite),
      lon: Schema.optionalKey(Schema.Finite),
      center: Schema.optionalKey(Coordinates),
      tags: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
    }),
  ),
});
export type OverpassElement = (typeof OverpassResponse.Type)["elements"][number];

export const OVERPASS_QUERY = `[out:json][timeout:300];nwr["amenity"="casino"]["name"];out center tags;`;

export interface CatalogVenue {
  readonly name: string;
  readonly kind: "casino" | "online";
  readonly city: string | null;
  readonly region: string | null;
  readonly country: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly source: "osm" | "curated";
  readonly sourceRef: string;
}

const tag = (tags: Readonly<Record<string, string>>, ...keys: ReadonlyArray<string>) => {
  for (const key of keys) {
    const value = tags[key]?.trim();
    if (value) return value.slice(0, 80);
  }
  return null;
};

/** Maps one OSM casino to a catalog venue; unnamed places are skipped. */
export const fromOsm = (element: OverpassElement): CatalogVenue | null => {
  const tags = element.tags ?? {};
  const name = tag(tags, "name:en", "name");
  if (!name) return null;
  const point =
    element.lat !== undefined && element.lon !== undefined
      ? { lat: element.lat, lon: element.lon }
      : (element.center ?? null);
  const country = tag(tags, "addr:country")?.toUpperCase() ?? null;
  return {
    name,
    kind: "casino",
    city: tag(tags, "addr:city"),
    region: tag(tags, "addr:state", "addr:province"),
    country: country && /^[A-Z]{2}$/.test(country) ? country : null,
    lat: point?.lat ?? null,
    lng: point?.lon ?? null,
    source: "osm",
    sourceRef: `${element.type}/${element.id}`,
  };
};

/** Regulated online casinos people commonly play; extend as players ask for more. */
export const curatedOnline: ReadonlyArray<CatalogVenue> = [
  "BetMGM Casino",
  "BetRivers Casino",
  "Caesars Palace Online Casino",
  "DraftKings Casino",
  "FanDuel Casino",
  "Fanatics Casino",
  "Golden Nugget Online Casino",
  "Hard Rock Bet Casino",
].map((name) => ({
  name,
  kind: "online",
  city: null,
  region: null,
  country: "US",
  lat: null,
  lng: null,
  source: "curated",
  sourceRef: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
}));
