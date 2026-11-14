import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import {
  CurrentUser,
  InvalidRequest,
  MinorUnits,
  PlayerId,
  SessionId,
  TripId,
  type CrewActivityItem,
  type CrewActivityPage,
} from "@stacks/contracts";
import { playerResults } from "@stacks/shared/results";

import { EntryRow, GroupRow, SessionRow, TripRow, VenueRow } from "../db/rows.ts";
import { decodeRows } from "./Access.ts";
import { venueColumns } from "./Views.ts";

const PAGE_SIZE = 50;

// A cursor is the last item's time in microseconds, Postgres's precision, and its id. Milliseconds
// would skip or repeat items that share one.
const CURSOR = /^(\d{1,18})\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

const parseCursor = (cursor: string | undefined) => {
  if (cursor === undefined) return Effect.succeed(null);
  const match = CURSOR.exec(cursor);
  return match
    ? Effect.succeed({ at: match[1]!, id: match[2]! })
    : Effect.fail(new InvalidRequest({ message: "That page of activity no longer exists." }));
};

const ActivityRow = Schema.Struct({
  source: Schema.Literals(["trip", "session"]),
  id: Schema.String,
  atKey: Schema.String,
});

/** Activity from every group the caller is an active member of, newest first. */
export const activity = Effect.fn("Crew.activity")(function* (query: { readonly cursor?: string }) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  const after = yield* parseCursor(query.cursor);
  const rows = yield* sql`
    with mine as (
      select m.group_id from memberships m
      join players p on p.group_id = m.group_id and p.user_id = m.user_id
      where m.user_id = ${userId} and m.left_at is null
    ),
    activity as (
      select 'trip' as source, t.id, t.started_at as at
      from trips t where t.group_id in (select group_id from mine)
      union all
      select 'session', s.id, coalesce(s.ended_at, s.started_at)
      from sessions s where s.group_id in (select group_id from mine)
    ),
    keyed as (
      select source, id, (extract(epoch from at) * 1000000)::bigint as at_key from activity
    )
    select source, id::text, at_key::text from keyed
    ${after ? sql`where (at_key, id) < (${after.at}::bigint, ${after.id}::uuid)` : sql``}
    order by keyed.at_key desc, keyed.id desc
    limit ${PAGE_SIZE + 1}
  `.pipe(Effect.flatMap(decodeRows(ActivityRow)));

  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  const nextCursor = rows.length > PAGE_SIZE && last ? `${last.atKey}.${last.id}` : null;
  if (page.length === 0) return { items: [], nextCursor } satisfies CrewActivityPage;

  const tripIds = page.filter((row) => row.source === "trip").map((row) => TripId.make(row.id));
  const sessionIds = page
    .filter((row) => row.source === "session")
    .map((row) => SessionId.make(row.id));
  const sessions =
    sessionIds.length === 0
      ? []
      : yield* sql`select * from sessions where id in ${sql.in(sessionIds)}`.pipe(
          Effect.flatMap(decodeRows(SessionRow)),
        );
  const allTripIds = Array.from(new Set([...tripIds, ...sessions.map((s) => s.tripId)]));
  const closedIds = sessions.filter((s) => s.status === "closed").map((s) => s.id);
  const venueIds = Array.from(new Set(sessions.map((s) => s.venueId)));

  const [trips, groups, venues, seats, entries] = yield* Effect.all(
    [
      sql`select * from trips where id in ${sql.in(allTripIds)}`.pipe(
        Effect.flatMap(decodeRows(TripRow)),
      ),
      sql`
        select g.id, g.name, g.currency, g.created_at from groups g
        where g.id in (select group_id from trips where id in ${sql.in(allTripIds)})
      `.pipe(Effect.flatMap(decodeRows(GroupRow))),
      venueIds.length === 0
        ? Effect.succeed([])
        : sql`
            select ${venueColumns(sql)} from venues v where v.id in ${sql.in(venueIds)}
          `.pipe(Effect.flatMap(decodeRows(VenueRow))),
      sessionIds.length === 0
        ? Effect.succeed([])
        : sql`
            select sp.session_id, sp.player_id, p.display_name
            from session_players sp join players p on p.id = sp.player_id
            where sp.session_id in ${sql.in(sessionIds)}
            order by sp.joined_at, sp.player_id
          `.pipe(
            Effect.flatMap(
              decodeRows(
                Schema.Struct({
                  sessionId: SessionId,
                  playerId: PlayerId,
                  displayName: Schema.String,
                }),
              ),
            ),
          ),
      closedIds.length === 0
        ? Effect.succeed([])
        : sql`select * from entries where session_id in ${sql.in(closedIds)}`.pipe(
            Effect.flatMap(decodeRows(EntryRow)),
          ),
    ],
    { concurrency: "unbounded" },
  );

  const tripById = new Map(trips.map((trip) => [trip.id, trip]));
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const venueById = new Map(venues.map((venue) => [venue.id, venue]));
  const refs = (tripId: TripId) => {
    const trip = tripById.get(tripId)!;
    const group = groupById.get(trip.groupId)!;
    return {
      group: { id: group.id, name: group.name, currency: group.currency },
      trip: { id: trip.id, name: trip.name },
    };
  };

  const items = page.map((row): CrewActivityItem => {
    if (row.source === "trip") {
      const tripId = TripId.make(row.id);
      return { kind: "trip_started", ...refs(tripId), startedAt: tripById.get(tripId)!.startedAt };
    }
    const session = sessionById.get(SessionId.make(row.id))!;
    const players = seats
      .filter((seat) => seat.sessionId === session.id)
      .map(({ playerId, displayName }) => ({ playerId, displayName }));
    const shared = {
      ...refs(session.tripId),
      sessionId: session.id,
      venue: venueById.get(session.venueId)!,
    };
    if (session.endedAt === null) {
      return { kind: "session_live", ...shared, players, startedAt: session.startedAt };
    }
    const results = playerResults(entries.filter((entry) => entry.sessionId === session.id));
    return {
      kind: "session_finished",
      ...shared,
      players: players.map((player) => ({
        ...player,
        net: results.get(player.playerId)?.net ?? MinorUnits.make(0),
      })),
      endedAt: session.endedAt,
    };
  });
  return { items, nextCursor } satisfies CrewActivityPage;
});
