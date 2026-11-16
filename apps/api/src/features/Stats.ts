import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import type { GroupId, GroupStats, TripId } from "@stacks/contracts";
import { resultsBy } from "@stacks/shared/results";

import { EntryRow, SessionRow, VenueRow } from "../db/rows.ts";
import * as Access from "./Access.ts";
import * as TripTables from "./TripTables.ts";
import { venueColumns } from "./Views.ts";

const elapsed = (startedAt: DateTime.Utc, endedAt: DateTime.Utc) =>
  Math.max(0, DateTime.toEpochMillis(endedAt) - DateTime.toEpochMillis(startedAt));

/**
 * Every finished session and table in the group's trips, with each member's result and time at
 * it. Members only: the clients rank, filter and award from this.
 */
export const forGroup = Effect.fn("Stats.forGroup")(function* (groupId: GroupId) {
  const sql = yield* SqlClient.SqlClient;
  yield* Access.membership(groupId);
  const sessions = yield* sql`
    select * from sessions where group_id = ${groupId} and status = 'closed'
    order by started_at, created_at
  `.pipe(Effect.flatMap(Access.decodeRows(SessionRow)));
  const entries = yield* sql`
    select e.* from entries e join sessions s on s.id = e.session_id
    where e.group_id = ${groupId} and s.status = 'closed' and e.voided_at is null
  `.pipe(Effect.flatMap(Access.decodeRows(EntryRow)));
  const trips = yield* sql<{ id: TripId }>`select id from trips where group_id = ${groupId}`;
  const tables = yield* TripTables.load({ tripIds: trips.map((trip) => trip.id) });
  const venueIds = Array.from(new Set(sessions.map((s) => s.venueId)));
  const sessionVenues =
    venueIds.length === 0
      ? []
      : yield* sql`
          select ${venueColumns(sql)} from venues v where v.id in ${sql.in(venueIds)}
        `.pipe(Effect.flatMap(Access.decodeRows(VenueRow)));

  const sessionResults = resultsBy(sessions, entries, (s) => s.id);
  const plays = [
    ...sessions.map((s) => {
      // An older group session has no visits: everyone at it played the whole session.
      const played = elapsed(s.startedAt, s.endedAt!);
      return {
        id: s.id,
        tripId: s.tripId,
        game: s.game,
        venueId: s.venueId,
        startedAt: s.startedAt,
        endedAt: s.endedAt!,
        results: Array.from(sessionResults.get(s.id) ?? [], ([playerId, result]) => ({
          playerId,
          buyIn: result.buyIn,
          net: result.net,
          milliseconds: played,
        })),
      };
    }),
    ...tables.flatMap(({ table, endedAt, startedAt, results, memberMilliseconds }) => {
      if (endedAt === null || table.tripId === null) return [];
      const time = new Map(memberMilliseconds.map((row) => [row.playerId, row.milliseconds]));
      return [
        {
          id: table.id,
          tripId: table.tripId,
          game: table.game,
          venueId: table.venueId,
          startedAt,
          endedAt,
          results: results.map(({ playerId, buyIn, net }) => ({
            playerId,
            buyIn,
            net,
            milliseconds: time.get(playerId) ?? 0,
          })),
        },
      ];
    }),
  ].toSorted((a, b) => DateTime.toEpochMillis(a.startedAt) - DateTime.toEpochMillis(b.startedAt));

  const named = new Set(plays.flatMap((play) => (play.venueId ? [play.venueId] : [])));
  const venues = new Map(
    [...sessionVenues, ...tables.flatMap((table) => (table.venue ? [table.venue] : []))].map(
      (venue) => [venue.id, venue],
    ),
  );
  return {
    plays,
    venues: Array.from(venues.values()).filter((venue) => named.has(venue.id)),
  } satisfies GroupStats;
});
