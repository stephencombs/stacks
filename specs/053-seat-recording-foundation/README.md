---
status: in-progress
created: 2026-11-25
priority: medium
tags:
  - seats
  - contracts
  - shared
  - api
  - client-runtime
parent: "052"
created_at: 2026-11-25T05:46:45.668388500Z
updated_at: 2026-11-26T03:26:19.126413600Z
transitions:
  - status: planned
    at: 2026-11-25T05:52:05.455267500Z
  - status: in-progress
    at: 2026-11-26T03:26:19.126413600Z
---

# Seat selection: contracts, offline ledger, API sync, and migrations

## Overview

Adds visit-scoped seatings and table seat counts across the shared core, Postgres, API, and client-runtime offline store without coupling seat writes to `visit.revision`.

## Requirements

### Contracts (`packages/contracts`)

- [ ] `packages/contracts/src/recording.ts`:
  - Add `tableSeats: Schema.optionalKey(Schema.NullOr(Seat))` to `Table` (keeps existing offline `RecordingState` blobs compatible at `version: 2`).
  - Add `VisitSeating` (`id: SeatingId`, `visitId: VisitId`, `seat: Schema.NullOr(Seat)`, `occurredAt: Schema.DateTimeUtc`, `createdBy: ActorId`, `createdAt: Schema.DateTimeUtc`, `voidedAt: Schema.NullOr(Schema.DateTimeUtc)`, `voidedBy: Schema.NullOr(ActorId)`, `voidReason: Schema.NullOr(Schema.String)`) reusing the same audit invariant check as `PlayEntry`.
- [ ] `packages/contracts/src/recordingCommands.ts`:
  - Add optional `tableSeats: Schema.optionalKey(Schema.NullOr(Seat))` to `start`, `open_table`, `record_completed`, and `TableDetails`.
  - Add `RecordingCommand` variants:
    - `set_table_seats`: `{ type: "set_table_seats", ...common, tableId: TableId, tableSeats: Schema.NullOr(Seat) }`
    - `set_seat`: `{ type: "set_seat", ...common, tableId: TableId, visitId: VisitId, seatingId: SeatingId, seat: Schema.NullOr(Seat), occurredAt: Schema.DateTimeUtc, replacesSeatingId: Schema.optionalKey(SeatingId), reason: Schema.optionalKey(Schema.NonEmptyString) }` (no `expectedRevision`)
    - `void_seating`: `{ type: "void_seating", ...common, tableId: TableId, visitId: VisitId, seatingId: SeatingId, reason: Schema.NonEmptyString }` (no `expectedRevision`)
  - Export `SeatingCommand` and `isSeatingCommand`; keep `set_table_seats` classified cleanly so starter-only table commands (`set_table_trip`, `appoint_recorder`, `revoke_recorder`, `delete_table`) stay starter-only while `set_table_seats` allows starter or appointed recorder.
  - Add `seatings: Schema.optionalKey(Schema.Array(VisitSeating))` to `RecordingHistory` and `TableView`.

### Pure shared rules (`packages/shared`)

- [ ] `packages/shared/src/seats.ts`:
  - Update `seatCount` to accept `{ readonly game: Game | null; readonly tableSeats?: number | null }`.
  - Add `normalizeTableSeats(game, tableSeats)` (returns `null` when `game` is not in `tableSizes` or input is nullish; throws/rejects sizes outside `tableSizes[game].sizes`).
  - Add `sortSeatings`, `visitSeatNow(seatings)`, `tableLiveSeats(visits, seatings)` (live non-deleted visits only; deterministic latest-timestamp tie-break if a reopen/restore overlaps), and `visitSeatOutcome(seatings)` (`{ kind: "none" } | { kind: "seat"; seat: number } | { kind: "multiple"; seats: ReadonlyArray<number> }`).
  - Keep `seatsNow` for legacy `Session.tsx`.
- [ ] `packages/shared/src/recording.ts`:
  - Add `readonly seatings: ReadonlyArray<VisitSeating>` to `RecordingLedger`.
  - Normalize `tableSeats` on `start`, `open_table`, `record_completed`, and `edit_visit` (`table` update clears `tableSeats` to `null` if game changes to a non-seated game; validates shrink against live occupied seats if `tableSeats` shrinks).
  - Implement `set_table_seats` in `applyRecordingCommand`: authorized for starter or recorder (`authorize(table, actorPlayers, table.starterPlayerId, ...)`), game must be in `tableSizes`, new size must be `>=` every currently occupied live seat.
  - Implement `set_seat`: authorized via `authorize(table, actorPlayers, visit.playerId, ...)`; table game must be seated; visit must belong to `tableId` and not be deleted; `occurredAt >= visit.startedAt` (and `<= visit.finishedAt` when finished); `seat` within `1..seatCount(table)` when non-null; live visits check live occupancy (`RecordingError("conflict", ...)` if taken by another live visit); optional `replacesSeatingId` voids the target seating (`preparedAt >= target.createdAt`, non-empty `reason`) and inserts the replacement; never bumps `visit.revision`.
  - Implement `void_seating`: authorized via `authorize(...)`; target must belong to `visitId`, not be voided, `preparedAt >= target.createdAt`; on a live visit, verify the reverted `visitSeatNow` is not currently occupied by another live visit (`conflict` if taken); never bumps `visit.revision`.

### Database and API (`apps/api`)

- [ ] Add migration `apps/api/src/db/migrations/0027_table_seats_and_visit_seatings.ts` and register it in `migrations/index.ts`:
  - `alter table tables add column table_seats smallint check (table_seats between 1 and 14)`
  - `create table personal_seatings (...)` with `visit_id references personal_visits (id)`, `seat smallint check (seat between 1 and 14)`, `occurred_at`, `created_by`, `created_at`, `voided_at`, `voided_by`, `void_reason`, audit check constraints, and index `(visit_id, occurred_at, created_at, id)`.
- [ ] Update `apps/api/src/db/rows.ts` (`TableRow.tableSeats`, `PersonalSeatingRow`).
- [ ] Update `apps/api/src/features/Recording.ts`:
  - `tableFields`/`tableOf`, `loadLedger` (load table visits + `personal_seatings` under `lockTable` for seat/size commands), `save` (persist `tables.table_seats`, insert/update `personal_seatings`, write `personal_operations`), `applyOne` (handle `personal_seatings_pkey` as `conflict`, call `tableChanged` for realtime refresh), `history` (return `seatings` for visible visits), `viewOf` (return `seatings` for non-deleted visits).
- [ ] Update `apps/api/src/features/Account.ts` and `Account.test.ts` per `docs/internals/account-deletion.md`: delete `personal_seatings` for deleted solo tables, move `created_by` and `voided_by` to `DELETED_ACTOR` on surviving rows, and register the `personal_seatings.visit_id` FK in `Account.test.ts`.
- [ ] Update `apps/api/src/features/LegacyMigration.ts` and `LegacyMigration.test.ts`: copy `sessions.table_seats` to `tables.table_seats` and import legacy `seatings` into `personal_seatings` idempotently.
- [ ] Update `apps/api/src/features/TripTables.ts` to populate `tableSeats` on constructed `Table` objects.

### Client runtime (`packages/client-runtime`)

- [ ] `packages/client-runtime/src/recordingState.ts`: add `seatings` to `RecordingState` (default `[]` in `withDefaults`, reset in `recordingBase`, validate all `set_table_seats` / `set_seat` / `void_seating` receipts and table `tableSeats` in `validateRecordingState`).
- [ ] `packages/client-runtime/src/recording.ts`: add `tableSeats` to start/open inputs; add `set_table_seats`, `set_seat`, `void_seating` to `RecordingInput`, `prepareRecordingCommand`, and `freezeState`.
- [ ] `packages/client-runtime/src/recordingSync.ts`: handle `history.seatings`, `settled`, `inputOf`, and `recordRejectedAgain` for the new commands.
- [ ] `packages/client-runtime/src/recordingView.ts`: expose `seatings`, `currentSeat`, and `seatOutcome` on `RecordedVisit` / `RecordingVisitView` and `seatings` on `RecordingTableView`; add seating lines to `historyLines` (including voided seatings); add `"seat"` to `SessionEditField` / `sessionEditFields` when `seatCount(visit.table) !== null`; add rejection copy in `describeRecordingRejection` reassuring users that their recorded play is saved; scope `recordingSyncView` for seat/table-size commands.
- [ ] `packages/client-runtime/src/liveTable.ts`: include `seatNumber`, `seatOutcome`, `tableSeats`, and `occupiedSeats` on `TableSeat` / `LiveTable`, combining local and server `TableView.seatings`.

## Non-goals

- Mobile UI components and screens (`054`).
- Stats breakdowns and CSV export (`055`, `056`).

## Acceptance criteria

- [ ] Unit and property tests in `packages/shared/src/seats.test.ts` and `recording.test.ts` verify `visitSeatOutcome` (`none`, single seat, multiple seats, `[S, null]` excluded, voided rows ignored), live occupancy conflicts, shrink guards, non-revision-bumping seat commands, and `reopen`/`restore_visit` deterministic overlap resolution.
- [ ] API integration tests against seeded Postgres verify push/history/table-view sync, starter/recorder/participant permissions, offline seat conflict rejecting only `set_seat` while subsequent `add`/`finish` succeed, realtime `tableChanged` notices, `Account.remove` FK coverage, and `LegacyMigration` seating import.
- [ ] Client-runtime tests verify offline `RecordingState` backward-compatible decoding (old docs without `seatings` or `tableSeats`), replay, rejection recovery, `historyLines`, and `liveTable`.
- [ ] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, and `pnpm test` pass.
