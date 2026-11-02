import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import { CurrentUser, type TripId, type UpdateLimitsRequest } from "@stacks/contracts";

import { UserLimitsRow } from "../db/rows.ts";
import * as Access from "./Access.ts";
import * as Trips from "./Trips.ts";

export const get = Effect.fn("Limits.get")(function* (tripId: TripId) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  const trip = yield* Trips.load(tripId);
  yield* Access.membership(trip.groupId);
  const [row] = yield* sql`
    select l.loss_limit, g.currency, u.session_reminder_minutes
    from groups g
    left join trip_user_limits l on l.trip_id = ${tripId} and l.user_id = ${userId}
    left join user_limits u on u.user_id = ${userId}
    where g.id = ${trip.groupId}
  `.pipe(Effect.flatMap(Access.decodeRows(UserLimitsRow)));
  return row!;
});

export const update = Effect.fn("Limits.update")(function* (
  tripId: TripId,
  request: typeof UpdateLimitsRequest.Type,
) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  const trip = yield* Trips.load(tripId);
  yield* Access.membership(trip.groupId);
  yield* Access.ensureUser();
  yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* sql`
      insert into user_limits (user_id, session_reminder_minutes, updated_at)
      values (${userId}, ${request.sessionReminderMinutes}, now())
      on conflict (user_id) do update set
        session_reminder_minutes = excluded.session_reminder_minutes, updated_at = now()
    `;
      if (request.lossLimit === null) {
        yield* sql`delete from trip_user_limits where trip_id = ${tripId} and user_id = ${userId}`;
      } else {
        yield* sql`
        insert into trip_user_limits (trip_id, user_id, loss_limit)
        values (${tripId}, ${userId}, ${BigInt(request.lossLimit)})
        on conflict (trip_id, user_id) do update set loss_limit = excluded.loss_limit
      `;
      }
    }),
  );
  return yield* get(tripId);
});
