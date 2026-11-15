import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import {
  CurrentUser,
  GroupId,
  PlayerId,
  Table,
  type TableId,
  UserId,
  type TripId,
  type TripTable,
  type VenueId,
} from "@stacks/contracts";
import { groupTable, inGroupAt } from "@stacks/shared/tripTables";

import { PersonalEntryRow, PersonalVisitRow, TableRow, VenueRow } from "../db/rows.ts";
import { decodeRows } from "./Access.ts";
import { venueColumns } from "./Views.ts";

const Timestamp = Schema.DateTimeUtcFromDate;

/**
 * The tables in the given trips, as their groups see them. A table imported from an older group
 * session is left out: that session already counts.
 */
export const load = Effect.fn("TripTables.load")(function* (
  where:
    | { readonly tripIds: ReadonlyArray<TripId> }
    | { readonly tableIds: ReadonlyArray<TableId> },
) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  const ids = "tripIds" in where ? where.tripIds : where.tableIds;
  if (ids.length === 0) return [];
  const tables = yield* sql`
    select t.*, tr.group_id from tables t join trips tr on tr.id = t.trip_id
    where ${"tripIds" in where ? sql`t.trip_id` : sql`t.id`} in ${sql.in(ids)}
      and t.legacy_session_id is null and t.starter_player_id is not null
  `.pipe(
    Effect.flatMap(
      decodeRows(
        Schema.Struct({ ...TableRow.fields, starterPlayerId: PlayerId, groupId: GroupId }),
      ),
    ),
  );
  if (tables.length === 0) return [];
  const tableIds = tables.map((table) => table.id);
  const groupIds = Array.from(new Set(tables.map((table) => table.groupId)));
  const venueIds = Array.from(
    new Set(tables.flatMap((table) => (table.venueId === null ? [] : [table.venueId]))),
  );

  const [visits, entries, players, members, absences, venues] = yield* Effect.all(
    [
      sql`
        select * from personal_visits where table_id in ${sql.in(tableIds)} and deleted_at is null
        order by started_at, id
      `.pipe(Effect.flatMap(decodeRows(PersonalVisitRow))),
      sql`
        select e.* from personal_entries e join personal_visits v on v.id = e.visit_id
        where v.table_id in ${sql.in(tableIds)} and v.deleted_at is null and e.voided_at is null
      `.pipe(Effect.flatMap(decodeRows(PersonalEntryRow))),
      sql`
        select p.id, p.display_name, p.user_id from players p
        where p.id in (
          select player_id from personal_visits
          where table_id in ${sql.in(tableIds)} and deleted_at is null
        )
      `.pipe(
        Effect.flatMap(
          decodeRows(
            Schema.Struct({
              id: PlayerId,
              displayName: Schema.String,
              userId: Schema.NullOr(UserId),
            }),
          ),
        ),
      ),
      // Every account-held player in these groups, current members and former ones alike.
      sql`
        select p.id, p.group_id, p.user_id, m.left_at from players p
        left join memberships m on m.group_id = p.group_id and m.user_id = p.user_id
        where p.group_id in ${sql.in(groupIds)} and p.user_id is not null
      `.pipe(
        Effect.flatMap(
          decodeRows(
            Schema.Struct({
              id: PlayerId,
              groupId: GroupId,
              userId: UserId,
              leftAt: Schema.NullOr(Timestamp),
            }),
          ),
        ),
      ),
      sql`
        select group_id, user_id, left_at, returned_at from membership_absences
        where group_id in ${sql.in(groupIds)}
      `.pipe(
        Effect.flatMap(
          decodeRows(
            Schema.Struct({
              groupId: GroupId,
              userId: UserId,
              leftAt: Timestamp,
              returnedAt: Timestamp,
            }),
          ),
        ),
      ),
      venueIds.length === 0
        ? Effect.succeed([])
        : sql`select ${venueColumns(sql)} from venues v where v.id in ${sql.in(venueIds)}`.pipe(
            Effect.flatMap(decodeRows(VenueRow)),
          ),
    ],
    { concurrency: "unbounded" },
  );

  const playerById = new Map(players.map((player) => [player.id, player]));
  const memberByAccount = new Map(members.map((m) => [`${m.groupId}:${m.userId}`, m]));
  const awayByAccount = Map.groupBy(absences, (a) => `${a.groupId}:${a.userId}`);
  const venueById = new Map<VenueId, (typeof venues)[number]>(venues.map((v) => [v.id, v]));

  const loaded = tables.flatMap((row): ReadonlyArray<TripTable> => {
    const own = visits.filter((visit) => visit.tableId === row.id);
    const visitIds = new Set(own.map((visit) => visit.id));
    // A table player counts as the member holding the same account, for visits started while
    // that member was in the group. Others stay on the table, out of the standings.
    const table = groupTable(
      own,
      entries.filter((entry) => visitIds.has(entry.visitId)),
      (visit) => {
        const userId = playerById.get(visit.playerId)?.userId;
        const account = `${row.groupId}:${userId}`;
        const member = userId ? memberByAccount.get(account) : undefined;
        if (!member) return null;
        const absences = awayByAccount.get(account) ?? [];
        return inGroupAt(visit.startedAt, { leftAt: member.leftAt, absences }) ? member.id : null;
      },
    );
    if (!table) return [];
    const mine = own.findLast((visit) => playerById.get(visit.playerId)?.userId === userId);
    return [
      {
        table: Table.make({
          id: row.id,
          tripId: row.tripId,
          game: row.game,
          venueId: row.venueId,
          highLimit: row.highLimit,
          starterPlayerId: row.starterPlayerId,
        }),
        venue: row.venueId === null ? null : (venueById.get(row.venueId) ?? null),
        startedAt: table.startedAt,
        endedAt: table.endedAt,
        minutesPlayed: table.minutesPlayed,
        playerIds: table.seated,
        playing: table.inPlay.map((row) => row.playerId),
        results: table.results,
        inPlay: table.inPlay,
        others: table.others.map((other) => ({
          displayName: playerById.get(other.playerId)?.displayName ?? "Player",
          playing: other.playing,
          net: other.net,
        })),
        myVisitId: mine?.id ?? null,
      },
    ];
  });
  return loaded.toSorted(
    (a, b) => DateTime.toEpochMillis(a.startedAt) - DateTime.toEpochMillis(b.startedAt),
  );
});
