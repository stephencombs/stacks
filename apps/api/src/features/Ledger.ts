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
  type EntryId,
  type GroupId,
  type RecordSettlementRequest,
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
    insert into entries (id, group_id, session_id, kind, player_id, counterparty_id, amount,
      occurred_at, note, created_by, replaces_entry_id)
    values (${entry.id}, ${entry.groupId}, ${entry.sessionId}, ${entry.kind}, ${entry.playerId},
      ${entry.counterpartyId}, ${BigInt(entry.amount)}, ${DateTime.toDateUtc(entry.occurredAt)},
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

export const voidEntry = Effect.fn("Ledger.voidEntry")(function* (
  entryId: EntryId,
  request: typeof VoidEntryRequest.Type,
) {
  const entry = yield* loadEntry(entryId);
  const member = yield* Access.membership(entry.groupId);
  yield* requireCanVoid(member, entry);
  if (entry.voidedAt !== null) return yield* new Conflict({ reason: "entry_voided" });
  if (entry.sessionId !== null) {
    const session = yield* Views.loadSession(entry.sessionId);
    if (session.status === "closed") return yield* new Conflict({ reason: "session_closed" });
  }
  yield* markVoided(entryId, request.reason);
  return yield* loadEntry(entryId);
});

export const recordSettlement = Effect.fn("Ledger.recordSettlement")(function* (
  groupId: GroupId,
  request: typeof RecordSettlementRequest.Type,
) {
  const { userId } = yield* CurrentUser;
  yield* Access.membership(groupId);
  yield* Access.requirePlayersInGroup(groupId, [request.fromPlayerId, request.toPlayerId]);
  const now = yield* DateTime.now;
  const entry = yield* validEntry({
    id: request.id,
    groupId,
    sessionId: null,
    kind: "settlement",
    playerId: request.fromPlayerId,
    counterpartyId: request.toPlayerId,
    amount: request.amount,
    occurredAt: request.occurredAt ?? now,
    note: request.note,
    createdBy: userId,
    createdAt: now,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    replacesEntryId: null,
  });
  return yield* insertEntry(entry);
});
