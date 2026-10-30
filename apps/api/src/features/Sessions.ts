import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import {
  Conflict,
  CurrentUser,
  InvalidRequest,
  NotFound,
  type CloseSessionRequest,
  type CreateSessionRequest,
  type MoveSessionRequest,
  type PlayerId,
  type SeatRequest,
  type SessionId,
  type TripId,
} from "@stacks/contracts";

import { seatsNow, tableSeats } from "@stacks/shared/seats";

import { SeatingRow } from "../db/rows.ts";
import * as Access from "./Access.ts";
import * as Trips from "./Trips.ts";
import * as Venues from "./Venues.ts";
import * as Views from "./Views.ts";

/** A new session goes in a trip that's still going. */
export const create = Effect.fn("Sessions.create")(function* (
  tripId: TripId,
  request: typeof CreateSessionRequest.Type,
) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  const trip = yield* Trips.load(tripId);
  const { groupId } = trip;
  yield* Access.membership(groupId);
  // A retry of a session that already landed gets it back, even after the trip ended.
  const [existing] = yield* sql`select group_id from sessions where id = ${request.id}`;
  if (existing) {
    if (existing.groupId !== groupId) return yield* new Conflict({ reason: "id_taken" });
    return yield* Views.sessionDetail(request.id);
  }
  if (trip.endedAt !== null) return yield* new Conflict({ reason: "trip_ended" });
  const [venue] = yield* Effect.all(
    [
      Venues.findVisible(request.venueId, groupId).pipe(
        Effect.catchTag("NotFound", () =>
          Effect.fail(new Conflict({ reason: "venue_not_available" })),
        ),
      ),
      Access.requirePlayersInGroup(groupId, request.playerIds),
    ],
    { concurrency: "unbounded" },
  );
  const startedAt = request.startedAt ?? (yield* DateTime.now);

  const inserted = yield* sql.withTransaction(
    Effect.gen(function* () {
      const rows = yield* sql`
        insert into sessions (id, group_id, trip_id, venue_id, game, started_at, notes,
          created_by)
        values (${request.id}, ${groupId}, ${tripId}, ${venue.id}, ${request.game},
          ${DateTime.toDateUtc(startedAt)}, ${request.notes}, ${userId})
        on conflict (id) do nothing
        returning id
      `;
      if (rows.length === 0) return false;
      const players = Array.from(new Set(request.playerIds), (playerId) => ({
        sessionId: request.id,
        groupId,
        playerId,
      }));
      if (players.length > 0) yield* sql`insert into session_players ${sql.insert(players)}`;
      return true;
    }),
  );
  if (!inserted) {
    const existing = yield* Views.loadSession(request.id);
    if (existing.groupId !== groupId) return yield* new Conflict({ reason: "id_taken" });
  }
  return yield* Views.sessionDetail(request.id);
});

/** Loads a session the current user can see, with their membership in its group. */
export const access = Effect.fn("Sessions.access")(function* (sessionId: SessionId) {
  const session = yield* Views.loadSession(sessionId);
  const member = yield* Access.membership(session.groupId);
  return { session, member };
});

export const get = Effect.fn("Sessions.get")(function* (sessionId: SessionId) {
  yield* access(sessionId);
  return yield* Views.sessionDetail(sessionId);
});

export const addPlayer = Effect.fn("Sessions.addPlayer")(function* (
  sessionId: SessionId,
  playerId: PlayerId,
) {
  const sql = yield* SqlClient.SqlClient;
  const { session } = yield* access(sessionId);
  if (session.status === "closed") return yield* new Conflict({ reason: "session_closed" });
  yield* Access.requirePlayersInGroup(session.groupId, [playerId]);
  yield* sql`
    insert into session_players (session_id, group_id, player_id)
    values (${sessionId}, ${session.groupId}, ${playerId})
    on conflict do nothing
  `;
  return yield* Views.sessionDetail(sessionId);
});

/**
 * Sits a player down, moves them or stands them up. Anyone in the group can, the same as
 * recording a buy-in. A seat holds one player at a time.
 */
export const seat = Effect.fn("Sessions.seat")(function* (
  sessionId: SessionId,
  request: typeof SeatRequest.Type,
) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  const { session } = yield* access(sessionId);
  // A retry of a seating that already landed is the same write.
  const [existing] = yield* sql`select session_id from seatings where id = ${request.id}`;
  if (existing) {
    if (existing.sessionId !== sessionId) return yield* new Conflict({ reason: "id_taken" });
    return yield* Views.sessionDetail(sessionId);
  }
  if (session.status === "closed") return yield* new Conflict({ reason: "session_closed" });
  const seats = tableSeats[session.game];
  if (seats === undefined) {
    return yield* new InvalidRequest({ message: "This game isn't played from seats." });
  }
  if (request.seat !== null && request.seat > seats) {
    return yield* new InvalidRequest({ message: `This table has ${seats} seats.` });
  }
  const [atTable] = yield* sql`
    select 1 from session_players
    where session_id = ${sessionId} and player_id = ${request.playerId}
  `;
  if (!atTable) return yield* new Conflict({ reason: "player_not_in_session" });
  const occurredAt = request.occurredAt ?? (yield* DateTime.now);

  yield* sql.withTransaction(
    Effect.gen(function* () {
      // Two phones seating people at once queue here, so a seat can't end up with two players.
      yield* sql`select 1 from sessions where id = ${sessionId} for update`;
      const seatings = yield* sql`
        select id, session_id, player_id, seat, occurred_at from seatings
        where session_id = ${sessionId} order by occurred_at, created_at
      `.pipe(Effect.flatMap(Access.decodeRows(SeatingRow)));
      const now = seatsNow(seatings);
      if (request.seat === (now.get(request.playerId) ?? null)) return;
      const taken = [...now].some(([p, s]) => s === request.seat && p !== request.playerId);
      if (taken) return yield* new Conflict({ reason: "seat_taken" });
      yield* sql`
        insert into seatings (id, session_id, group_id, player_id, seat, occurred_at, created_by)
        values (${request.id}, ${sessionId}, ${session.groupId}, ${request.playerId},
          ${request.seat}, ${DateTime.toDateUtc(occurredAt)}, ${userId})
      `;
    }),
  );
  return yield* Views.sessionDetail(sessionId);
});

/** Closing locks the ledger for the session, so everyone who bought in must have cashed out. */
export const close = Effect.fn("Sessions.close")(function* (
  sessionId: SessionId,
  request: typeof CloseSessionRequest.Type,
) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  const { session } = yield* access(sessionId);
  if (session.status === "closed") return yield* Views.sessionDetail(sessionId);

  const stillPlaying = yield* sql`
    select sp.player_id from session_players sp
    where sp.session_id = ${sessionId}
      and exists (
        select 1 from entries e where e.session_id = sp.session_id and e.player_id = sp.player_id
          and e.kind = 'buy_in' and e.voided_at is null
      )
      and not exists (
        select 1 from entries e where e.session_id = sp.session_id and e.player_id = sp.player_id
          and e.kind = 'cash_out' and e.voided_at is null
      )
  `;
  if (stillPlaying.length > 0) return yield* new Conflict({ reason: "players_not_cashed_out" });

  const endedAt = request.endedAt ?? (yield* DateTime.now);
  if (DateTime.isLessThan(endedAt, session.startedAt)) {
    return yield* new InvalidRequest({ message: "A session can't end before it starts." });
  }
  yield* sql`
    update sessions set status = 'closed', ended_at = ${DateTime.toDateUtc(endedAt)},
      closed_by = ${userId}
    where id = ${sessionId} and status = 'live'
  `;
  return yield* Views.sessionDetail(sessionId);
});

export const reopen = Effect.fn("Sessions.reopen")(function* (sessionId: SessionId) {
  const sql = yield* SqlClient.SqlClient;
  const { member } = yield* access(sessionId);
  yield* Access.requireAdmin(member);
  yield* sql`
    update sessions set status = 'live', ended_at = null, closed_by = null, reopened_at = now()
    where id = ${sessionId} and status = 'closed'
  `;
  return yield* Views.sessionDetail(sessionId);
});

/** An admin can move a session into another trip that's still going, to fix where it was logged. */
export const move = Effect.fn("Sessions.move")(function* (
  sessionId: SessionId,
  request: typeof MoveSessionRequest.Type,
) {
  const sql = yield* SqlClient.SqlClient;
  const { session, member } = yield* access(sessionId);
  yield* Access.requireAdmin(member);
  const trip = yield* Trips.load(request.tripId);
  if (trip.groupId !== session.groupId) return yield* new NotFound({ resource: "trip" });
  if (trip.endedAt !== null) return yield* new Conflict({ reason: "trip_ended" });
  yield* sql`update sessions set trip_id = ${trip.id} where id = ${sessionId}`;
  return yield* Views.sessionDetail(sessionId);
});
