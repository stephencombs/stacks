import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import { EntryId, EntryKind, Game, SessionId, type GroupId } from "@stacks/contracts";
import { formatDecimal } from "@stacks/shared/money";

import { EntryRow, GroupRow } from "../db/rows.ts";
import * as Access from "./Access.ts";

const ExportRow = Schema.Struct({
  id: EntryId,
  occurredAt: Schema.DateTimeUtcFromDate,
  tripName: Schema.NullOr(Schema.String),
  sessionId: Schema.NullOr(SessionId),
  venueName: Schema.NullOr(Schema.String),
  game: Schema.NullOr(Game),
  kind: EntryKind,
  playerName: Schema.String,
  counterpartyName: Schema.NullOr(Schema.String),
  amount: EntryRow.fields.amount,
  note: Schema.NullOr(Schema.String),
  voidedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
  voidReason: Schema.NullOr(Schema.String),
  replacesEntryId: Schema.NullOr(EntryId),
});

const COLUMNS = [
  "entry_id",
  "date",
  "trip",
  "session",
  "venue",
  "game",
  "kind",
  "player",
  "counterparty",
  "amount",
  "currency",
  "note",
  "voided",
  "voided_at",
  "void_reason",
  "replaces_entry_id",
] as const;

const csvCell = (value: string) =>
  /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

export const csvText = (value: string) =>
  /^[=+\-@]/.test(value.replaceAll(/\p{Cc}/gu, "").trimStart()) ? `'${value}` : value;

const csvRow = (cells: ReadonlyArray<string>) => cells.map(csvCell).join(",");

export const forGroup = Effect.fn("Export.forGroup")(function* (groupId: GroupId) {
  const sql = yield* SqlClient.SqlClient;
  yield* Access.membership(groupId);
  const [[group], rows] = yield* Effect.all(
    [
      sql`select id, name, currency, created_at from groups where id = ${groupId}`.pipe(
        Effect.flatMap(Access.decodeRows(GroupRow)),
      ),
      sql`
        select
          e.id,
          e.occurred_at,
          t.name as trip_name,
          e.session_id,
          v.name as venue_name,
          s.game,
          e.kind,
          p.display_name as player_name,
          cp.display_name as counterparty_name,
          e.amount,
          e.note,
          e.voided_at,
          e.void_reason,
          e.replaces_entry_id
        from entries e
        left join sessions s on s.id = e.session_id
        left join venues v on v.id = s.venue_id
        left join trips t on t.id = coalesce(e.trip_id, s.trip_id)
        join players p on p.id = e.player_id
        left join players cp on cp.id = e.counterparty_id
        where e.group_id = ${groupId}
        order by e.occurred_at, e.created_at, e.id
      `.pipe(Effect.flatMap(Access.decodeRows(ExportRow))),
    ],
    { concurrency: "unbounded" },
  );
  const currency = group!.currency;
  const lines = [
    COLUMNS.join(","),
    ...rows.map((row) =>
      csvRow([
        row.id,
        DateTime.formatIso(row.occurredAt),
        csvText(row.tripName ?? ""),
        row.sessionId ?? "",
        csvText(row.venueName ?? ""),
        row.game ?? "",
        row.kind,
        csvText(row.playerName),
        csvText(row.counterpartyName ?? ""),
        formatDecimal(row.amount, currency),
        currency,
        csvText(row.note ?? ""),
        row.voidedAt !== null ? "true" : "false",
        row.voidedAt ? DateTime.formatIso(row.voidedAt) : "",
        csvText(row.voidReason ?? ""),
        row.replacesEntryId ?? "",
      ]),
    ),
  ];
  return `${lines.join("\n")}\n`;
});
