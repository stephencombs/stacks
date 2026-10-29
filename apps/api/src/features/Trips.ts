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
  type TripDetail,
  type TripId,
} from "@stacks/contracts";

import { TripRow } from "../db/rows.ts";
import * as Access from "./Access.ts";
import * as Views from "./Views.ts";

const load = Effect.fn("Trips.load")(function* (tripId: TripId) {
  const sql = yield* SqlClient.SqlClient;
  const [trip] = yield* sql`select * from trips where id = ${tripId}`.pipe(
    Effect.flatMap(Access.decodeRows(TripRow)),
  );
  if (!trip) return yield* new NotFound({ resource: "trip" });
  return trip;
});

/** Whether another of the group's trips shares any time with `from` to `to` (open-ended if null). */
const overlaps = Effect.fn("Trips.overlaps")(function* (
  groupId: GroupId,
  from: DateTime.Utc,
  to: DateTime.Utc | null,
  except: TripId,
) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql`
    select 1 from trips
    where group_id = ${groupId} and id <> ${except}
      and tstzrange(started_at, ended_at) &&
        tstzrange(${DateTime.toDateUtc(from)}, ${to === null ? null : DateTime.toDateUtc(to)})
    limit 1
  `;
  return rows.length > 0;
});

/** Trip writes in a group take turns, so two at once can't both pass the overlap check. */
const lockGroup = Effect.fn("Trips.lockGroup")(function* (groupId: GroupId) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`select id from groups where id = ${groupId} for update`;
});

export const create = Effect.fn("Trips.create")(function* (
  groupId: GroupId,
  request: typeof CreateTripRequest.Type,
) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  yield* Access.membership(groupId);
  const startedAt = request.startedAt ?? (yield* DateTime.now);
  yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* lockGroup(groupId);
      const [existing] = yield* sql`select group_id from trips where id = ${request.id}`;
      if (existing) return;
      if (yield* overlaps(groupId, startedAt, null, request.id)) {
        return yield* new Conflict({ reason: "trip_overlaps" });
      }
      yield* sql`
        insert into trips (id, group_id, name, started_at, created_by)
        values (${request.id}, ${groupId}, ${request.name}, ${DateTime.toDateUtc(startedAt)},
          ${userId})
      `;
    }),
  );
  const stored = yield* load(request.id);
  if (stored.groupId !== groupId) return yield* new Conflict({ reason: "id_taken" });
  return stored;
});

export const get = Effect.fn("Trips.get")(function* (tripId: TripId) {
  const trip = yield* load(tripId);
  yield* Access.membership(trip.groupId);
  const sessions = yield* Views.tripSessions(trip);
  return { trip, sessions } satisfies TripDetail;
});

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
  yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* lockGroup(trip.groupId);
      if (yield* overlaps(trip.groupId, trip.startedAt, null, tripId)) {
        return yield* new Conflict({ reason: "trip_overlaps" });
      }
      yield* sql`update trips set ended_at = null where id = ${tripId}`;
    }),
  );
  return yield* load(tripId);
});

/** Whoever started the trip or an admin can delete it. Its sessions stay in the group. */
export const remove = Effect.fn("Trips.remove")(function* (tripId: TripId) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  const trip = yield* load(tripId);
  const member = yield* Access.membership(trip.groupId);
  if (member.role === "member" && trip.createdBy !== userId) {
    return yield* new Forbidden({ reason: "not_your_trip" });
  }
  yield* sql`delete from trips where id = ${tripId}`;
  return trip;
});
