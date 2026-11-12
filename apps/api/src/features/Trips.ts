import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import {
  Conflict,
  CurrentUser,
  Forbidden,
  InvalidRequest,
  NotFound,
  type CreateTripRequest,
  type EndTripRequest,
  type GroupId,
  type TripId,
} from "@stacks/contracts";

import { TripRow } from "../db/rows.ts";
import * as Access from "./Access.ts";
import * as Views from "./Views.ts";

export const load = Effect.fn("Trips.load")(function* (tripId: TripId) {
  const sql = yield* SqlClient.SqlClient;
  const [trip] = yield* sql`select * from trips where id = ${tripId}`.pipe(
    Effect.flatMap(Access.decodeRows(TripRow)),
  );
  if (!trip) return yield* new NotFound({ resource: "trip" });
  return trip;
});

export const create = Effect.fn("Trips.create")(function* (
  groupId: GroupId,
  request: typeof CreateTripRequest.Type,
) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  yield* Access.membership(groupId);
  const startedAt = request.startedAt ?? (yield* DateTime.now);
  yield* sql`
    insert into trips (id, group_id, name, started_at, created_by)
    values (${request.id}, ${groupId}, ${request.name}, ${DateTime.toDateUtc(startedAt)}, ${userId})
    on conflict (id) do nothing
  `;
  const stored = yield* load(request.id);
  if (stored.groupId !== groupId) return yield* new Conflict({ reason: "id_taken" });
  return stored;
});

export const get = Effect.fn("Trips.get")(function* (tripId: TripId) {
  const trip = yield* load(tripId);
  yield* Access.membership(trip.groupId);
  return yield* Views.tripDetail(trip);
});

/** Ending a trip stops new sessions going in. */
export const end = Effect.fn("Trips.end")(function* (
  tripId: TripId,
  request: typeof EndTripRequest.Type,
) {
  const sql = yield* SqlClient.SqlClient;
  const trip = yield* load(tripId);
  yield* Access.membership(trip.groupId);
  if (trip.endedAt !== null) return yield* new Conflict({ reason: "trip_ended" });
  const endedAt = request.endedAt ?? (yield* DateTime.now);
  if (DateTime.isLessThan(endedAt, trip.startedAt)) {
    return yield* new InvalidRequest({ message: "A trip can't end before it started." });
  }
  yield* sql`update trips set ended_at = ${DateTime.toDateUtc(endedAt)} where id = ${tripId}`;
  return yield* load(tripId);
});

export const reopen = Effect.fn("Trips.reopen")(function* (tripId: TripId) {
  const sql = yield* SqlClient.SqlClient;
  const trip = yield* load(tripId);
  yield* Access.membership(trip.groupId);
  if (trip.endedAt === null) return yield* new Conflict({ reason: "trip_open" });
  yield* sql`update trips set ended_at = null where id = ${tripId}`;
  return yield* load(tripId);
});

/** Whoever started the trip or an admin can delete it, once nothing has been played in it. */
export const remove = Effect.fn("Trips.remove")(function* (tripId: TripId) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  const trip = yield* load(tripId);
  const member = yield* Access.membership(trip.groupId);
  if (member.role === "member" && trip.createdBy !== userId) {
    return yield* new Forbidden({ reason: "not_your_trip" });
  }
  const used = yield* sql`
    select 1 from sessions where trip_id = ${tripId}
    union all select 1 from stakes where trip_id = ${tripId}
    limit 1
  `;
  if (used.length > 0) return yield* new Conflict({ reason: "trip_not_empty" });
  yield* sql`delete from trips where id = ${tripId}`;
  return trip;
});
