import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import type { GroupId, GroupStats, SessionId, TableId, TripId } from "@stacks/contracts";
import { fundingOf, sessionVisits } from "@stacks/shared/funding";
import { resultsBy } from "@stacks/shared/results";
import { seatBucketOf, visitSeatOutcome } from "@stacks/shared/seats";
import { stakeLines } from "@stacks/shared/stakes";

import { EntryRow, SeatingRow, SessionRow, VenueRow } from "../db/rows.ts";
import * as Access from "./Access.ts";
import * as TripTables from "./TripTables.ts";
import { groupStakes, venueColumns } from "./Views.ts";

const LegacySeatingRow = Schema.Struct({
  ...SeatingRow.fields,
  createdAt: Schema.DateTimeUtcFromDate,
});

const elapsed = (startedAt: DateTime.Utc, endedAt: DateTime.Utc) =>
  Math.max(0, DateTime.toEpochMillis(endedAt) - DateTime.toEpochMillis(startedAt));

/**
 * Every finished session and table in the group's trips, with each member's result and time at
 * it, and the group's additional buy-ins, covered buy-ins and stakes. Members only: the clients
 * rank, filter and award from this. It carries scoped aggregates and group player IDs, never an
 * entry ID.
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

  const legacySeatings = yield* sql`
    select st.id, st.session_id, st.player_id, st.seat, st.occurred_at, st.created_at
    from seatings st join sessions s on s.id = st.session_id
    where s.group_id = ${groupId} and s.status = 'closed' and s.game = 'blackjack'
    order by st.occurred_at, st.created_at, st.id
  `.pipe(Effect.flatMap(Access.decodeRows(LegacySeatingRow)));

  const trips = yield* sql<{ id: TripId; ended: boolean }>`
    select id, ended_at is not null as ended from trips where group_id = ${groupId}
  `;

  const tables = yield* TripTables.load({ tripIds: trips.map((trip) => trip.id) });
  const venueIds = Array.from(new Set(sessions.map((s) => s.venueId)));

  const sessionVenues =
    venueIds.length === 0
      ? []
      : yield* sql`
          select ${venueColumns(sql)} from venues v where v.id in ${sql.in(venueIds)}
        `.pipe(Effect.flatMap(Access.decodeRows(VenueRow)));

  const sessionResults = resultsBy(sessions, entries, (s) => s.id);
  const entriesBySession = Map.groupBy(entries, (entry) => entry.sessionId);

  const plays = [
    ...sessions.map((s) => {
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

  const finished = tables.filter(({ endedAt, table }) => endedAt !== null && table.tripId !== null);

  const funding = fundingOf<SessionId | TableId>([
    ...sessions.map((s) => ({
      playId: s.id,
      visits: sessionVisits(entriesBySession.get(s.id) ?? []),
    })),
    ...finished.map(({ table, visits }) => ({ playId: table.id, visits })),
  ]);

  const { stakes, sessions: allSessions, outcomes } = yield* groupStakes(groupId);

  const stakeRows = stakeLines(
    stakes,
    outcomes,
    allSessions,
    new Set(trips.flatMap((trip) => (trip.ended ? [trip.id] : []))),
  );

  const named = new Set(plays.flatMap((play) => (play.venueId ? [play.venueId] : [])));

  const venues = new Map(
    [...sessionVenues, ...tables.flatMap((table) => (table.venue ? [table.venue] : []))].map(
      (venue) => [venue.id, venue],
    ),
  );

  const legacySeatingsBySession = Map.groupBy(legacySeatings, (row) => row.sessionId);

  const seats = [
    ...sessions.flatMap((s) => {
      if (s.game !== "blackjack") return [];
      const played = elapsed(s.startedAt, s.endedAt!);

      const byPlayer = Map.groupBy(legacySeatingsBySession.get(s.id) ?? [], (row) => row.playerId);

      const results = sessionResults.get(s.id);

      if (!results) return [];

      return Array.from(results, ([playerId, result]) => {
        const rows = (byPlayer.get(playerId) ?? []).map((row) => ({
          id: row.id,
          seat: row.seat,
          occurredAt: row.occurredAt,
          createdAt: row.createdAt,
          voidedAt: null,
        }));

        const seat = seatBucketOf(visitSeatOutcome(rows));

        return seat === null
          ? []
          : [{ playId: s.id, playerId, seat, net: result.net, milliseconds: played }];
      }).flat();
    }),
    ...finished.flatMap(({ table, seatVisits }) =>
      table.game === "blackjack" ? seatVisits.map((visit) => ({ playId: table.id, ...visit })) : [],
    ),
  ];

  return {
    plays,
    venues: Array.from(venues.values()).filter((venue) => named.has(venue.id)),
    ...funding,
    stakes: stakeRows,
    seats,
  } satisfies GroupStats;
});
