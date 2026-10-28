import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import {
  Conflict,
  CurrentUser,
  InvalidRequest,
  type CloseSessionRequest,
  type CreateSessionRequest,
  type GroupId,
  type ListSessionsQuery,
  type PlayerId,
  type SessionId,
} from "@stacks/contracts";

import * as Access from "./Access.ts";
import * as Venues from "./Venues.ts";
import * as Views from "./Views.ts";

export const create = Effect.fn("Sessions.create")(function* (
  groupId: GroupId,
  request: typeof CreateSessionRequest.Type,
) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  yield* Access.membership(groupId);
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
        insert into sessions (id, group_id, venue_id, game, started_at, notes, created_by)
        values (${request.id}, ${groupId}, ${venue.id}, ${request.game},
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

export const list = Effect.fn("Sessions.list")(function* (
  groupId: GroupId,
  query: typeof ListSessionsQuery.Type,
) {
  yield* Access.membership(groupId);
  return yield* Views.sessionSummaries(groupId, {
    limit: 30,
    ...(query.before ? { before: query.before } : {}),
  });
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
