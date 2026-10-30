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
  SessionId,
  type SessionSummary,
  type TripDetail,
  type TripId,
  type VenueId,
} from "@stacks/contracts";
import { balances } from "@stacks/shared/balances";
import { resultsBy } from "@stacks/shared/results";
import { settleUp } from "@stacks/shared/settleUp";
import { stakeOutcomes, withStakes } from "@stacks/shared/stakes";

import {
  EntryRow,
  GroupRow,
  PlayerRow,
  SeatingRow,
  SessionRow,
  StakeRow,
  TripRow,
  VenueRow,
} from "../db/rows.ts";
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
  const [venues, entries, seats] = yield* Effect.all(
    [
      sql`
        select ${venueColumns(sql)} from venues v where v.id in ${sql.in(venueIds)}
      `.pipe(Effect.flatMap(decodeRows(VenueRow))),
      sql`
        select * from entries
        where session_id in ${sql.in(sessionIds)} and voided_at is null
      `.pipe(Effect.flatMap(decodeRows(EntryRow))),
      sql`
        select session_id, player_id from session_players
        where session_id in ${sql.in(sessionIds)} order by joined_at
      `.pipe(
        Effect.flatMap(decodeRows(Schema.Struct({ sessionId: SessionId, playerId: PlayerId }))),
      ),
    ],
    { concurrency: "unbounded" },
  );

  const venueById = new Map<VenueId, (typeof venues)[number]>(venues.map((v) => [v.id, v]));
  const resultsBySession = resultsBy(sessions, entries, (session) => session.id);
  const cashedOut = new Set(
    entries.filter((e) => e.kind === "cash_out").map((e) => `${e.sessionId}:${e.playerId}`),
  );
  return sessions.map((session): SessionSummary => {
    const playerIds = seats
      .filter((seat) => seat.sessionId === session.id)
      .map((seat) => seat.playerId);
    return {
      session,
      venue: venueById.get(session.venueId)!,
      playerIds,
      playing:
        session.status === "live"
          ? playerIds.filter((id) => !cashedOut.has(`${session.id}:${id}`))
          : [],
      results: toResultList(resultsBySession.get(session.id)),
    };
  });
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
  const [[summary], playerIds, entries, seatings] = yield* Effect.all(
    [
      summaries([session]),
      sql`
        select player_id from session_players where session_id = ${sessionId} order by joined_at
      `.pipe(Effect.flatMap(decodeRows(Schema.Struct({ playerId: PlayerId })))),
      sql`
        select * from entries where session_id = ${sessionId} order by occurred_at, created_at
      `.pipe(Effect.flatMap(decodeRows(EntryRow))),
      sql`
        select id, session_id, player_id, seat, occurred_at from seatings
        where session_id = ${sessionId} order by occurred_at, created_at
      `.pipe(Effect.flatMap(decodeRows(SeatingRow))),
    ],
    { concurrency: "unbounded" },
  );
  return {
    session,
    venue: summary!.venue,
    playerIds: playerIds.map((row) => row.playerId),
    results: summary!.results,
    entries,
    seatings,
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

/**
 * Balances across all of a group's trips: what each player is owed or owes overall. Each stake
 * only covers sessions in its own trip, so this is the sum of every trip's own balances.
 */
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

/** A trip's own ledger: who owes whom from its entries, settlements and stakes. */
export const tripLedger = Effect.fn("Views.tripLedger")(function* (tripId: TripId) {
  const sql = yield* SqlClient.SqlClient;
  const [entries, stakes, sessions] = yield* Effect.all(
    [
      sql`
        select e.* from entries e left join sessions s on s.id = e.session_id
        where e.voided_at is null and (e.trip_id = ${tripId} or s.trip_id = ${tripId})
      `.pipe(Effect.flatMap(decodeRows(EntryRow))),
      sql`select * from stakes where trip_id = ${tripId} order by started_at, created_at`.pipe(
        Effect.flatMap(decodeRows(StakeRow)),
      ),
      sql`select * from sessions where trip_id = ${tripId} order by started_at`.pipe(
        Effect.flatMap(decodeRows(SessionRow)),
      ),
    ],
    { concurrency: "unbounded" },
  );
  const live = stakes.filter((stake) => stake.voidedAt === null);
  const outcomes = stakeOutcomes(
    live,
    sessions,
    entries.filter((entry) => entry.sessionId !== null),
  );
  return { owed: withStakes(balances(entries), stakes, outcomes), stakes, outcomes, sessions };
});

export const tripDetail = Effect.fn("Views.tripDetail")(function* (trip: typeof TripRow.Type) {
  const sql = yield* SqlClient.SqlClient;
  const [{ owed, stakes, outcomes, sessions }, settlements] = yield* Effect.all(
    [
      tripLedger(trip.id),
      sql`
        select * from entries where trip_id = ${trip.id} and kind = 'settlement'
        order by occurred_at desc, created_at desc
      `.pipe(Effect.flatMap(decodeRows(EntryRow))),
    ],
    { concurrency: "unbounded" },
  );
  return {
    trip,
    sessions: yield* summaries(sessions),
    balances: Array.from(owed, ([playerId, amount]) => ({ playerId, amount })),
    transfers: settleUp(owed),
    settlements,
    stakes: stakes.map((stake) => ({
      stake,
      result: outcomes.get(stake.id)?.result ?? MinorUnits.make(0),
      owed: outcomes.get(stake.id)?.owed ?? MinorUnits.make(0),
    })),
  } satisfies TripDetail;
});

export const groupDetail = Effect.fn("Views.groupDetail")(function* (member: Membership) {
  const sql = yield* SqlClient.SqlClient;
  const { groupId } = member;
  // Independent reads, run together: each is a round trip to the database.
  const [[group], players, trips] = yield* Effect.all(
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
      sql`select * from trips where group_id = ${groupId} order by started_at desc`.pipe(
        Effect.flatMap(decodeRows(TripRow)),
      ),
    ],
    { concurrency: "unbounded" },
  );
  return {
    group: group!,
    role: member.role,
    myPlayerId: member.playerId,
    players,
    trips,
  } satisfies GroupDetail;
});
