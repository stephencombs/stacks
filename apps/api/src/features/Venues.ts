import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import {
  CurrentUser,
  InvalidRequest,
  NotFound,
  type CreateVenueRequest,
  type GroupId,
  type SearchVenuesQuery,
  type VenueId,
} from "@stacks/contracts";

import { VenueRow } from "../db/rows.ts";
import * as Access from "./Access.ts";
import { venueColumns } from "./Views.ts";

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

/**
 * Catalog venues plus the group's own home venues. With a location and no search text, the
 * nearest come first; otherwise verified venues come first.
 */
export const search = Effect.fn("Venues.search")(function* (query: typeof SearchVenuesQuery.Type) {
  const sql = yield* SqlClient.SqlClient;
  if (query.groupId) yield* Access.membership(query.groupId);
  const text = query.q?.trim();
  const pattern = text ? `%${escapeLike(text)}%` : null;
  const near =
    query.lat !== undefined && query.lng !== undefined ? { lat: query.lat, lng: query.lng } : null;

  return yield* sql`
    select ${venueColumns(sql)} from venues v
    where v.merged_into_id is null
      and (v.group_id is null ${query.groupId ? sql`or v.group_id = ${query.groupId}` : sql``})
      ${pattern ? sql`and (v.name ilike ${pattern} or v.city ilike ${pattern})` : sql``}
    order by ${
      near && !pattern
        ? sql`power(v.lat - ${near.lat}, 2)
            + power((v.lng - ${near.lng}) * cos(radians(${near.lat})), 2) nulls last`
        : sql`(v.verified_at is not null) desc, v.name`
    }
    limit 20
  `.pipe(Effect.flatMap(Access.decodeRows(VenueRow)));
});

export const recent = Effect.fn("Venues.recent")(function* (groupId: GroupId) {
  const sql = yield* SqlClient.SqlClient;
  yield* Access.membership(groupId);
  return yield* sql`
    select ${venueColumns(sql)} from venues v
    join (
      select venue_id, max(started_at) as last_played from sessions
      where group_id = ${groupId} group by venue_id
    ) played on played.venue_id = v.id
    order by played.last_played desc
    limit 10
  `.pipe(Effect.flatMap(Access.decodeRows(VenueRow)));
});

export const findVisible = Effect.fn("Venues.findVisible")(function* (
  venueId: VenueId,
  groupId: GroupId | null,
) {
  const sql = yield* SqlClient.SqlClient;
  const [venue] = yield* sql`
    select ${venueColumns(sql)} from venues v
    where v.id = ${venueId} and (v.group_id is null or v.group_id = ${groupId})
  `.pipe(Effect.flatMap(Access.decodeRows(VenueRow)));
  if (!venue) return yield* new NotFound({ resource: "venue" });
  return venue;
});

/**
 * Anyone can add a casino to the shared catalog; it's usable right away and shows as
 * unverified until reviewed. A home venue stays private to one group.
 */
export const create = Effect.fn("Venues.create")(function* (
  request: typeof CreateVenueRequest.Type,
) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  if (request.kind === "home" && request.groupId === null) {
    return yield* new InvalidRequest({ message: "A home venue belongs to one group." });
  }
  const groupId = request.kind === "home" ? request.groupId : null;
  if (groupId) yield* Access.membership(groupId);
  yield* Access.ensureUser();
  yield* sql`
    insert into venues (id, name, kind, city, region, country, source, group_id, created_by)
    values (${request.id}, ${request.name}, ${request.kind}, ${request.city}, ${request.region},
      ${request.country}, 'user', ${groupId}, ${userId})
    on conflict (id) do nothing
  `;
  return yield* findVisible(request.id, groupId);
});
