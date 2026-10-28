import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import {
  MinorUnits,
  NotFound,
  PlayerId,
  type GroupDetail,
  type GroupId,
  type PlayerResult,
  type SessionDetail,
  type SessionId,
  type SessionSummary,
  type VenueId,
} from "@stacks/contracts";
import { balances } from "@stacks/shared/balances";
import { resultsBy } from "@stacks/shared/results";
import { settleUp } from "@stacks/shared/settleUp";
import { stakeOutcomes, withStakes } from "@stacks/shared/stakes";

import { EntryRow, GroupRow, PlayerRow, SessionRow, StakeRow, VenueRow } from "../db/rows.ts";
import { decodeRows, type Membership } from "./Access.ts";

export const venueColumns = (sql: SqlClient.SqlClient) => sql`
  v.id, v.name, v.kind, v.city, v.region, v.country, v.lat, v.lng,
  v.verified_at is not null as verified, v.group_id
`;

const toResultList = (results: ReadonlyMap<PlayerId, Omit<PlayerResult, "playerId">> | undefined) =>
  Array.from(results ?? [], ([playerId, result]) => ({ playerId, ...result }));

const summaries = Effect.fn("Views.summaries")(function* (
  sessions: ReadonlyArray<typeof SessionRow.Type>,
) {
  if (sessions.length === 0) return [];
  const sql = yield* SqlClient.SqlClient;
  const sessionIds = sessions.map((session) => session.id);
  const venueIds = Array.from(new Set(sessions.map((session) => session.venueId)));
  const [venues, entries] = yield* Effect.all(
    [
      sql`
        select ${venueColumns(sql)} from venues v where v.id in ${sql.in(venueIds)}
      `.pipe(Effect.flatMap(decodeRows(VenueRow))),
      sql`
        select * from entries
        where session_id in ${sql.in(sessionIds)} and voided_at is null
      `.pipe(Effect.flatMap(decodeRows(EntryRow))),
    ],
    { concurrency: "unbounded" },
  );

  const venueById = new Map<VenueId, (typeof venues)[number]>(venues.map((v) => [v.id, v]));
  const resultsBySession = resultsBy(sessions, entries, (session) => session.id);
  return sessions.map((session): SessionSummary => ({
    session,
    venue: venueById.get(session.venueId)!,
    results: toResultList(resultsBySession.get(session.id)),
  }));
});

export const sessionSummaries = Effect.fn("Views.sessionSummaries")(function* (
  groupId: GroupId,
  options: { readonly before?: DateTime.Utc; readonly limit: number },
) {
  const sql = yield* SqlClient.SqlClient;
  const sessions = yield* sql`
    select * from sessions
    where group_id = ${groupId}
      ${options.before ? sql`and started_at < ${DateTime.toDateUtc(options.before)}` : sql``}
    order by started_at desc
    limit ${options.limit}
  `.pipe(Effect.flatMap(decodeRows(SessionRow)));
  return yield* summaries(sessions);
});

export const loadSession = Effect.fn("Views.loadSession")(function* (sessionId: SessionId) {
  const sql = yield* SqlClient.SqlClient;
  const [session] = yield* sql`select * from sessions where id = ${sessionId}`.pipe(
    Effect.flatMap(decodeRows(SessionRow)),
  );
  if (!session) return yield* new NotFound({ resource: "session" });
  return session;
});

export const sessionDetail = Effect.fn("Views.sessionDetail")(function* (sessionId: SessionId) {
  const sql = yield* SqlClient.SqlClient;
  const session = yield* loadSession(sessionId);
  const [[summary], playerIds, entries] = yield* Effect.all(
    [
      summaries([session]),
      sql`
        select player_id from session_players where session_id = ${sessionId} order by joined_at
      `.pipe(Effect.flatMap(decodeRows(Schema.Struct({ playerId: PlayerId })))),
      sql`
        select * from entries where session_id = ${sessionId} order by occurred_at, created_at
      `.pipe(Effect.flatMap(decodeRows(EntryRow))),
    ],
    { concurrency: "unbounded" },
  );
  return {
    session,
    venue: summary!.venue,
    playerIds: playerIds.map((row) => row.playerId),
    results: summary!.results,
    entries,
  } satisfies SessionDetail;
});

/** The group's stakes, voided ones included, and where each live one stands. */
const groupStakes = Effect.fn("Views.groupStakes")(function* (groupId: GroupId) {
  const sql = yield* SqlClient.SqlClient;
  const stakes = yield* sql`
    select * from stakes where group_id = ${groupId} order by started_at, created_at
  `.pipe(Effect.flatMap(decodeRows(StakeRow)));
  const live = stakes.filter((stake) => stake.voidedAt === null);
  if (live.length === 0) return { stakes, outcomes: stakeOutcomes([], [], []) };
  const [sessions, entries] = yield* Effect.all(
    [
      sql`select * from sessions where group_id = ${groupId}`.pipe(
        Effect.flatMap(decodeRows(SessionRow)),
      ),
      sql`
        select * from entries
        where group_id = ${groupId} and session_id is not null and voided_at is null
          and player_id in ${sql.in(Array.from(new Set(live.map((stake) => stake.borrowerId))))}
      `.pipe(Effect.flatMap(decodeRows(EntryRow))),
    ],
    { concurrency: "unbounded" },
  );
  return { stakes, outcomes: stakeOutcomes(live, sessions, entries) };
});

/** Balances from every entry that moved money between two players, and every live stake. */
export const groupBalances = Effect.fn("Views.groupBalances")(function* (groupId: GroupId) {
  const sql = yield* SqlClient.SqlClient;
  const [entries, { stakes, outcomes }] = yield* Effect.all(
    [
      sql`
        select * from entries
        where group_id = ${groupId} and voided_at is null and counterparty_id is not null
      `.pipe(Effect.flatMap(decodeRows(EntryRow))),
      groupStakes(groupId),
    ],
    { concurrency: "unbounded" },
  );
  return { owed: withStakes(balances(entries), stakes, outcomes), stakes, outcomes };
});

export const groupDetail = Effect.fn("Views.groupDetail")(function* (member: Membership) {
  const sql = yield* SqlClient.SqlClient;
  const { groupId } = member;
  // Independent reads, run together: each is a round trip to the database.
  const [[group], players, { owed, stakes, outcomes }, settlements, sessions] = yield* Effect.all(
    [
      sql`select id, name, currency, created_at from groups where id = ${groupId}`.pipe(
        Effect.flatMap(decodeRows(GroupRow)),
      ),
      sql`
        select p.id, p.display_name, p.user_id, m.role, p.claim_code
        from players p
        left join memberships m
          on m.group_id = p.group_id and m.user_id = p.user_id and m.left_at is null
        where p.group_id = ${groupId}
        order by p.created_at, p.id
      `.pipe(Effect.flatMap(decodeRows(PlayerRow))),
      groupBalances(groupId),
      sql`
        select * from entries
        where group_id = ${groupId} and kind = 'settlement'
        order by occurred_at desc, created_at desc
        limit 50
      `.pipe(Effect.flatMap(decodeRows(EntryRow))),
      sessionSummaries(groupId, { limit: 20 }),
    ],
    { concurrency: "unbounded" },
  );

  return {
    group: group!,
    role: member.role,
    myPlayerId: member.playerId,
    players,
    balances: Array.from(owed, ([playerId, amount]) => ({ playerId, amount })),
    transfers: settleUp(owed),
    settlements,
    stakes: stakes.map((stake) => ({
      stake,
      result: outcomes.get(stake.id)?.result ?? MinorUnits.make(0),
      owed: outcomes.get(stake.id)?.owed ?? MinorUnits.make(0),
    })),
    sessions,
  } satisfies GroupDetail;
});
