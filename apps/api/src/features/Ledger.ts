import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import {
  Conflict,
  CurrentUser,
  Entry,
  Forbidden,
  InvalidRequest,
  NotFound,
  type AddEntryRequest,
  type CloseSessionRequest,
  type EntryId,
  type SessionId,
  type VoidEntryRequest,
} from "@stacks/contracts";

import { EntryRow } from "../db/rows.ts";
import * as Access from "./Access.ts";
import * as Sessions from "./Sessions.ts";
import * as Views from "./Views.ts";

const loadEntry = Effect.fn("Ledger.loadEntry")(function* (entryId: EntryId) {
  const sql = yield* SqlClient.SqlClient;
  const [entry] = yield* sql`select * from entries where id = ${entryId}`.pipe(
    Effect.flatMap(Access.decodeRows(EntryRow)),
  );
  if (!entry) return yield* new NotFound({ resource: "entry" });
  return entry;
});

/** Whoever wrote the entry, the player it's about, or an admin can void it. */
const requireCanVoid = Effect.fn("Ledger.requireCanVoid")(function* (
  member: Access.Membership,
  entry: typeof EntryRow.Type,
) {
  const { userId } = yield* CurrentUser;
  if (
    member.role !== "member" ||
    entry.createdBy === userId ||
    entry.playerId === member.playerId
  ) {
    return;
  }
  return yield* new Forbidden({ reason: "not_your_entry" });
});

const markVoided = Effect.fn("Ledger.markVoided")(function* (
  entryId: EntryId,
  reason: string | null,
) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  yield* sql`
    update entries set voided_at = now(), voided_by = ${userId}, void_reason = ${reason}
    where id = ${entryId} and voided_at is null
  `;
});

const validEntry = (candidate: typeof Entry.Type) =>
  Schema.decodeUnknownEffect(Entry)(candidate).pipe(
    Effect.mapError((error) => new InvalidRequest({ message: error.message })),
  );

/** Inserts the entry; a retried write with the same ID returns what the first one stored. */
const insertEntry = Effect.fn("Ledger.insertEntry")(function* (entry: typeof Entry.Type) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    insert into entries (id, group_id, session_id, kind, player_id, counterparty_id,
      amount, occurred_at, note, created_by, replaces_entry_id)
    values (${entry.id}, ${entry.groupId}, ${entry.sessionId}, ${entry.kind},
      ${entry.playerId}, ${entry.counterpartyId}, ${BigInt(entry.amount)}, ${DateTime.toDateUtc(entry.occurredAt)},
      ${entry.note}, ${entry.createdBy}, ${entry.replacesEntryId})
    on conflict (id) do nothing
  `;
  const stored = yield* loadEntry(entry.id).pipe(Effect.orDie);
  if (stored.groupId !== entry.groupId || stored.sessionId !== entry.sessionId) {
    return yield* new Conflict({ reason: "id_taken" });
  }
  return stored;
});

export const addEntry = Effect.fn("Ledger.addEntry")(function* (
  sessionId: SessionId,
  request: typeof AddEntryRequest.Type,
) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  const { session, member } = yield* Sessions.access(sessionId);
  // A retry of a write that already landed gets the stored entry, even after the session closed.
  const [existing] = yield* sql`select * from entries where id = ${request.id}`.pipe(
    Effect.flatMap(Access.decodeRows(EntryRow)),
  );
  if (existing) {
    if (existing.sessionId !== sessionId) return yield* new Conflict({ reason: "id_taken" });
    return existing;
  }
  if (session.status === "closed") return yield* new Conflict({ reason: "session_closed" });
  yield* Access.requirePlayersInGroup(
    session.groupId,
    request.counterpartyId ? [request.playerId, request.counterpartyId] : [request.playerId],
  );
  const now = yield* DateTime.now;
  const entry = yield* validEntry({
    id: request.id,
    groupId: session.groupId,
    sessionId,
    kind: request.kind,
    playerId: request.playerId,
    counterpartyId: request.counterpartyId,
    amount: request.amount,
    occurredAt: request.occurredAt ?? now,
    note: request.note,
    createdBy: userId,
    createdAt: now,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    replacesEntryId: request.replacesEntryId,
  });

  const replaced = request.replacesEntryId ? yield* loadEntry(request.replacesEntryId) : null;
  if (replaced) {
    if (replaced.sessionId !== sessionId) {
      return yield* new InvalidRequest({
        message: "A correction replaces an entry in the same session.",
      });
    }
    yield* requireCanVoid(member, replaced);
  }

  return yield* sql.withTransaction(
    Effect.gen(function* () {
      const stored = yield* insertEntry(entry);
      yield* sql`
        insert into session_players (session_id, group_id, player_id)
        values (${sessionId}, ${session.groupId}, ${request.playerId})
        on conflict do nothing
      `;
      if (replaced) yield* markVoided(replaced.id, "Corrected");
      return stored;
    }),
  );
});

/**
 * Closes a session, which locks its ledger: everyone who bought in must have cashed out. The final
 * cash-outs can come in the same request, and land with the close or not at all.
 */
export const close = Effect.fn("Ledger.close")(function* (
  sessionId: SessionId,
  request: typeof CloseSessionRequest.Type,
) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  const { session } = yield* Sessions.access(sessionId);
  if (session.status === "closed") return yield* Views.sessionDetail(sessionId);
  const now = yield* DateTime.now;
  const endedAt = request.endedAt ?? now;
  if (DateTime.isLessThan(endedAt, session.startedAt)) {
    return yield* new InvalidRequest({ message: "A session can't end before it starts." });
  }
  const cashOuts = request.cashOuts ?? [];
  yield* Access.requirePlayersInGroup(
    session.groupId,
    cashOuts.map((c) => c.playerId),
  );
  const entries = yield* Effect.forEach(cashOuts, (c) =>
    validEntry({
      id: c.id,
      groupId: session.groupId,
      sessionId,
      kind: "cash_out",
      playerId: c.playerId,
      counterpartyId: null,
      amount: c.amount,
      occurredAt: endedAt,
      note: null,
      createdBy: userId,
      createdAt: now,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
      replacesEntryId: null,
    }),
  );

  yield* sql.withTransaction(
    Effect.gen(function* () {
      const [locked] = yield* sql`select status from sessions where id = ${sessionId} for update`;
      if (locked?.status === "closed") return;
      // A cash-out recorded elsewhere meanwhile already settled that player; a second would count
      // their chips twice.
      if (cashOuts.length > 0) {
        const already = yield* sql`
          select player_id from entries
          where session_id = ${sessionId} and kind = 'cash_out' and voided_at is null
            and player_id in ${sql.in(cashOuts.map((c) => c.playerId))}
            and id not in ${sql.in(cashOuts.map((c) => c.id))}
        `;
        if (already.length > 0) {
          return yield* new InvalidRequest({
            message: "Someone here already cashed out. Check the table and close again.",
          });
        }
      }
      for (const entry of entries) yield* insertEntry(entry);
      const stillPlaying = yield* sql`
        select sp.player_id from session_players sp
        where sp.session_id = ${sessionId}
          and exists (
            select 1 from entries e where e.session_id = sp.session_id
              and e.player_id = sp.player_id and e.kind = 'buy_in' and e.voided_at is null
          )
          and not exists (
            select 1 from entries e where e.session_id = sp.session_id
              and e.player_id = sp.player_id and e.kind = 'cash_out' and e.voided_at is null
          )
      `;
      if (stillPlaying.length > 0) return yield* new Conflict({ reason: "players_not_cashed_out" });
      yield* sql`
        update sessions set status = 'closed', ended_at = ${DateTime.toDateUtc(endedAt)},
          closed_by = ${userId}
        where id = ${sessionId}
      `;
    }),
  );
  return yield* Views.sessionDetail(sessionId);
});

export const voidEntry = Effect.fn("Ledger.voidEntry")(function* (
  entryId: EntryId,
  request: typeof VoidEntryRequest.Type,
) {
  const entry = yield* loadEntry(entryId);
  const member = yield* Access.membership(entry.groupId);
  yield* requireCanVoid(member, entry);
  if (entry.voidedAt !== null) return yield* new Conflict({ reason: "entry_voided" });
  const session = yield* Views.loadSession(entry.sessionId);
  if (session.status === "closed") return yield* new Conflict({ reason: "session_closed" });
  yield* markVoided(entryId, request.reason);
  return yield* loadEntry(entryId);
});
