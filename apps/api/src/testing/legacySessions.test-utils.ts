import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import type {
  AddEntryRequest,
  CloseSessionRequest,
  CreateSessionRequest,
  EntryId,
  GroupId,
  PlayerId,
  SessionId,
  TripId,
} from "@stacks/contracts";

const date = (value: DateTime.Utc | undefined) => (value ? DateTime.toDateUtc(value) : null);

export const seedSession = Effect.fn("fixtures.seedSession")(function* (
  tripId: TripId,
  session: Omit<typeof CreateSessionRequest.Type, "playerIds"> & {
    readonly playerIds: ReadonlyArray<PlayerId>;
    readonly tableSeats?: number;
  },
) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql.withTransaction(
    Effect.gen(function* () {
      const [row] = yield* sql<{ groupId: GroupId }>`
        insert into sessions (id, group_id, trip_id, venue_id, game, started_at, notes,
          high_limit, table_seats, created_by)
        select ${session.id}, t.group_id, t.id, ${session.venueId}, ${session.game},
          coalesce(${date(session.startedAt)}::timestamptz, now()), ${session.notes},
          ${session.highLimit ?? false}, ${session.tableSeats ?? null}, g.created_by
        from trips t join groups g on g.id = t.group_id where t.id = ${tripId}
        on conflict (id) do nothing
        returning group_id
      `;

      if (!row) return;

      const players = session.playerIds.map((playerId) => ({
        sessionId: session.id,
        groupId: row.groupId,
        playerId,
      }));

      if (players.length > 0) yield* sql`insert into session_players ${sql.insert(players)}`;
    }),
  );

  return session.id;
});

export const voidHistoricalEntry = Effect.fn("fixtures.voidHistoricalEntry")(function* (
  entryId: EntryId,
  reason: string | null,
) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    update entries set voided_at = now(), voided_by = created_by, void_reason = ${reason}
    where id = ${entryId}
  `;
});

export const seedEntry = Effect.fn("fixtures.seedEntry")(function* (
  sessionId: SessionId,
  entry: typeof AddEntryRequest.Type,
) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql.withTransaction(
    Effect.gen(function* () {
      const [inserted] = yield* sql`
        insert into entries (id, group_id, session_id, kind, player_id, counterparty_id,
          amount, occurred_at, note, created_by, replaces_entry_id)
        select ${entry.id}, s.group_id, s.id, ${entry.kind}, ${entry.playerId}, ${entry.counterpartyId},
          ${BigInt(entry.amount)}, coalesce(${date(entry.occurredAt)}::timestamptz, now()),
          ${entry.note}, s.created_by, ${entry.replacesEntryId}
        from sessions s where s.id = ${sessionId}
        on conflict (id) do nothing
        returning id
      `;

      if (!inserted) return;
      yield* sql`
        insert into session_players (session_id, group_id, player_id)
        select id, group_id, ${entry.playerId} from sessions where id = ${sessionId}
        on conflict do nothing
      `;

      if (entry.replacesEntryId) yield* voidHistoricalEntry(entry.replacesEntryId, "Corrected");
    }),
  );

  return entry;
});

export const finishHistoricalSession = Effect.fn("fixtures.finishHistoricalSession")(function* (
  sessionId: SessionId,
  close: typeof CloseSessionRequest.Type = {},
) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql.withTransaction(
    Effect.gen(function* () {
      const [row] = yield* sql<{ endedAt: Date }>`
        update sessions set status = 'closed', closed_by = created_by,
          ended_at = coalesce(${date(close.endedAt)}::timestamptz, greatest(started_at, now()))
        where id = ${sessionId} and status = 'live'
        returning ended_at
      `;

      if (!row) return;

      for (const cashOut of close.cashOuts ?? []) {
        yield* seedEntry(sessionId, {
          ...cashOut,
          kind: "cash_out",
          counterpartyId: null,
          occurredAt: DateTime.makeUnsafe(row.endedAt),
          note: null,
          replacesEntryId: null,
        });
      }
    }),
  );
});
