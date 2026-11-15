import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import type {
  GroupId,
  GroupStats,
  PlayerId,
  PlayerResult as ContractResult,
  TripId,
} from "@stacks/contracts";
import { mergeResults, resultsBy, type PlayerResult } from "@stacks/shared/results";
import { resultsBySeat } from "@stacks/shared/seats";

import { EntryRow, SeatingRow, SessionRow, VenueRow } from "../db/rows.ts";
import * as Access from "./Access.ts";
import * as TripTables from "./TripTables.ts";
import { venueColumns } from "./Views.ts";

const toList = (results: ReadonlyMap<PlayerId, Omit<ContractResult, "playerId">>) =>
  Array.from(results, ([playerId, result]) => ({ playerId, ...result }));

const toMap = (results: ReadonlyArray<ContractResult>): ReadonlyMap<PlayerId, PlayerResult> =>
  new Map(results.map(({ playerId, ...result }) => [playerId, result]));

const minutes = (startedAt: DateTime.Utc, endedAt: DateTime.Utc) =>
  Math.round((DateTime.toEpochMillis(endedAt) - DateTime.toEpochMillis(startedAt)) / 60_000);

/**
 * All-time results over the group's closed sessions and the closed tables in its trips, split by
 * player, game, venue, seat and session. Tables have no seats.
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
  const seatings = yield* sql`
    select st.id, st.session_id, st.player_id, st.seat, st.occurred_at
    from seatings st join sessions s on s.id = st.session_id
    where st.group_id = ${groupId} and s.status = 'closed'
    order by st.occurred_at, st.created_at
  `.pipe(Effect.flatMap(Access.decodeRows(SeatingRow)));
  const trips = yield* sql<{ id: TripId }>`select id from trips where group_id = ${groupId}`;
  const tables = yield* TripTables.load({ tripIds: trips.map((trip) => trip.id) });
  const venueIds = Array.from(new Set(sessions.map((s) => s.venueId)));
  const sessionVenues =
    venueIds.length === 0
      ? []
      : yield* sql`
          select ${venueColumns(sql)} from venues v where v.id in ${sql.in(venueIds)}
        `.pipe(Effect.flatMap(Access.decodeRows(VenueRow)));
  const venues = new Map(
    [...sessionVenues, ...tables.flatMap((table) => (table.venue ? [table.venue] : []))].map(
      (venue) => [venue.id, venue],
    ),
  );

  const sessionResults = resultsBy(sessions, entries, (s) => s.id);
  const played = [
    ...sessions.map((s) => ({
      id: s.id,
      tripId: s.tripId,
      game: s.game,
      venueId: s.venueId,
      startedAt: s.startedAt,
      minutes: minutes(s.startedAt, s.endedAt!),
      results: sessionResults.get(s.id) ?? new Map<PlayerId, PlayerResult>(),
    })),
    ...tables.flatMap(({ table, endedAt, startedAt, minutesPlayed, results }) =>
      endedAt === null || table.tripId === null
        ? []
        : [
            {
              id: table.id,
              tripId: table.tripId,
              game: table.game,
              venueId: table.venueId,
              startedAt,
              minutes: minutesPlayed,
              results: toMap(results),
            },
          ],
    ),
  ].toSorted((a, b) => DateTime.toEpochMillis(a.startedAt) - DateTime.toEpochMillis(b.startedAt));

  const breakdown = <K>(key: (play: (typeof played)[number]) => K | null) =>
    Array.from(
      Map.groupBy(
        played.flatMap((play) => {
          const k = key(play);
          return k === null ? [] : [{ k, play }];
        }),
        (row) => row.k,
      ),
      ([k, rows]) => ({
        key: k,
        sessionCount: rows.length,
        results: toList(mergeResults(rows.map((row) => row.play.results))),
      }),
    );

  return {
    sessionCount: played.length,
    minutesPlayed: played.reduce((total, play) => total + play.minutes, 0),
    byPlayer: toList(mergeResults(played.map((play) => play.results))),
    byGame: breakdown((play) => play.game),
    byVenue: breakdown((play) => (play.venueId ? (venues.get(play.venueId) ?? null) : null)),
    bySeat: Array.from(resultsBySeat(sessions, seatings, entries), ([seat, row]) => ({
      key: seat,
      sessionCount: row.sessions,
      results: toList(row.results),
    })).toSorted((a, b) => a.key - b.key),
    bySession: played.map(({ id, tripId, venueId, startedAt, results }) => ({
      id,
      tripId,
      venueId,
      startedAt,
      results: toList(results),
    })),
  } satisfies GroupStats;
});
