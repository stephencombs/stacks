import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import type { GroupId, GroupStats, PlayerId, PlayerResult } from "@stacks/contracts";
import { playerResults, resultsBy } from "@stacks/shared/results";

import { EntryRow, SessionRow, VenueRow } from "../db/rows.ts";
import * as Access from "./Access.ts";
import { venueColumns } from "./Views.ts";

const toList = (results: ReadonlyMap<PlayerId, Omit<PlayerResult, "playerId">>) =>
  Array.from(results, ([playerId, result]) => ({ playerId, ...result }));

/** All-time results over the group's closed sessions, split by player, game, venue and session. */
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
  const venues =
    sessions.length === 0
      ? []
      : yield* sql`
          select ${venueColumns(sql)} from venues v
          where v.id in ${sql.in(Array.from(new Set(sessions.map((s) => s.venueId))))}
        `.pipe(Effect.flatMap(Access.decodeRows(VenueRow)));

  const count = <K>(key: (session: (typeof sessions)[number]) => K) => {
    const counts = new Map<K, number>();
    for (const session of sessions) counts.set(key(session), (counts.get(key(session)) ?? 0) + 1);
    return counts;
  };
  const gameCounts = count((s) => s.game);
  const venueCounts = count((s) => s.venueId);
  const minutesPlayed = sessions.reduce(
    (total, s) =>
      total +
      Math.round(
        (DateTime.toEpochMillis(s.endedAt!) - DateTime.toEpochMillis(s.startedAt)) / 60_000,
      ),
    0,
  );

  const bySession = resultsBy(sessions, entries, (s) => s.id);

  return {
    sessionCount: sessions.length,
    minutesPlayed,
    byPlayer: toList(playerResults(entries)),
    byGame: Array.from(
      resultsBy(sessions, entries, (s) => s.game),
      ([game, results]) => ({
        key: game,
        sessionCount: gameCounts.get(game) ?? 0,
        results: toList(results),
      }),
    ),
    byVenue: venues.map((venue) => ({
      key: venue,
      sessionCount: venueCounts.get(venue.id) ?? 0,
      results: toList(resultsBy(sessions, entries, (s) => s.venueId).get(venue.id) ?? new Map()),
    })),
    bySession: sessions.map((session) => ({
      sessionId: session.id,
      startedAt: session.startedAt,
      results: toList(bySession.get(session.id) ?? new Map()),
    })),
  } satisfies GroupStats;
});
