---
status: planned
created: 2026-11-25
priority: medium
tags:
  - seats
  - recording
  - mobile
  - api
  - stats
created_at: 2026-11-25T05:46:30.125484900Z
updated_at: 2026-11-25T05:52:04.926444900Z
transitions:
  - status: planned
    at: 2026-11-25T05:52:04.926444900Z
---

# Blackjack seat selection: model, tabletop picker, and stats

## Overview

`PLAN.md` makes seat tracking optional during recording and calls for blackjack seat breakdowns in history and stats:

- Seat changes stay within a session and retain their history.
- Only sessions played entirely in one known seat contribute to that seat's result comparisons.
- Sessions with seat changes appear as `"Multiple seats"`; never assign their whole result to the longest-held seat.

Legacy group sessions (`0006_seatings`, `0007_table_seats`) had table seatings tied to `sessions` and a retired 3D Blender `TableMap`. The current player-first, offline-first recording architecture (`tables`, `personal_visits`, `RecordingCommand`) has no seat support yet.

This umbrella captures the product and architecture decisions shared across its four child specs.

## Ideation & Decisions

- **Games and table sizes.** Driven by `tableSizes` in `packages/shared/src/seats.ts`, starting with **Blackjack (`5`, `6`, or `7` seats; default `5`)** — numbered from the dealer's left (`Seat 1` = first base, `Seat N` = third base). `tableSeats: null` means the game's usual size (`5`). Keeping `Seat` (`1..14`) and `tableSizes` generic lets future seated games plug in without a schema change.
- **2D vector tabletop arc (not plain number pills, not the retired 3D Blender `TableMap`).**
  - A left-to-right `1 2 3 4 5` pill list is spatially backwards from sitting at a blackjack table (where Seat 1 / first base sits on the right and third base on the left).
  - Resurrecting the retired 3D Blender `TableMap` (93 WebP frames, chip sprite levels, camera director in `packages/client-runtime/src/table.ts` / `tableArt.ts`) adds heavy static assets, clashes with OKLCH light/dark tokens, and competes with the full-screen felt live screen (`008-live-screen`).
  - A crisp **2D semicircular tabletop arc** drawn with `react-native-svg` + plain views (matching Color Up's no-library chart philosophy in `AGENTS.md`) uses OKLCH tokens, works on the live felt and inside light/dark sheets, scales cleanly, renders `TableChip` avatars, keeps 44pt targets, and pairs with the existing list rows for VoiceOver/TalkBack.
- **Seat commands are decoupled from `visit.revision`.**
  - `set_seat` and `void_seating` carry `tableId`, `visitId`, and client-generated `SeatingId` / `RecordingOperationId`, with **no** `expectedRevision` and **no** increment to `visit.revision`.
  - Why: if two players claim Seat 3 offline at a shared table, the later sync rejects cleanly (`conflict`) **without** cascading revision conflicts onto that player's buy-ins, rebuys, or cash-outs (same isolation as `set_table_trip`).
  - `set_table_seats` is a table-level command so starter/recorders can adjust table size on `TableScreen` even before anyone buys in.
- **Immutable seating history with undo/void for mistakes.**
  - Every sit, move, or stand-up appends a `VisitSeating` row (`seat: Seat | null`, `occurredAt`, `createdBy`, `createdAt`, `voidedAt`, `voidedBy`, `voidReason`).
  - One-tap seat picks and moves show an **Undo** toast (`void_seating`, reason `"Undone"`), and mistakes can be voided from visit History — so an accidental tap never permanently pollutes a single-seat session into `"Multiple seats"`.
  - Fixing a wrong seat on a finished single-seat visit replaces it atomically (`replacesSeatingId`, reason `"Seat corrected"`) at `visit.startedAt`.
- **Live occupancy and visit lifecycle.**
  - At most one **live, non-deleted** visit (`finishedAt === null && deletedAt === undefined`) may occupy a given seat at a table.
  - Finishing (`finish`) or deleting (`delete_visit`) a visit preserves its seating history and immediately frees the seat on the live table.
  - `reopen` and `restore_visit` never fail due to a seat collision (ledger recovery always wins over seats). If another live visit took the seat in the meantime, `tableLiveSeats` resolves any overlap deterministically by latest active seating timestamp so the newer occupant holds the live spot and the reopened visit shows as unseated until a new seat is picked.
  - Shrinking `tableSeats` is rejected only while a live visit occupies a seat above the new size. Changing a table's `game` away from a seated game normalizes `tableSeats` to `null` while keeping historical seating rows intact (hidden in UI and excluded from blackjack seat stats).
- **Stats attribution (`PLAN.md`).**
  - `visitSeatOutcome(seatings)` evaluates non-voided seatings chronologically:
    - `none` — no seated records, or ended standing (`last.seat === null`) with at most one distinct seat (did not play the whole session in one known seat).
    - `seat` — at least one seated record, all non-null seats identical, and latest non-voided seating is that seat (not `null`).
    - `multiple` — two or more distinct non-null seats appeared.
  - Single-seat comparisons and Patterns sentences never include `"Multiple seats"` or unseated visits.
- **Permissions and account deletion.**
  - Starter and appointed recorders can set/move/clear any player's seat and change `tableSeats`.
  - Participants (joined via link or invite) can set/move/clear only their own visit's seat; they cannot change `tableSeats` or move others.
  - `Account.remove` deletes `personal_seatings` for deleted solo tables and moves `created_by` / `voided_by` to `DELETED_ACTOR` on surviving tables (`docs/internals/account-deletion.md`).

## Children

- `053-seat-recording-foundation`: contracts, pure shared rules, Postgres migration, API sync/views/account deletion/legacy migration, and `client-runtime` state and view models.
- `054-seat-picker-and-live-table`: `BlackjackTableArc`, `SeatPickerSheet`, and seat flows across iOS and Android recording screens.
- `055-personal-seat-stats-and-export`: Just me blackjack seat breakdown, seat filter chip, Patterns seat sentence, and CSV export `seat` column.
- `056-group-seat-stats`: Group stats blackjack seat breakdown (per-visit outcomes across tables and legacy sessions).

## Non-goals

- Multi-spot play (one player occupying two seats in one visit).
- Seats for non-blackjack games (poker, baccarat) until a future change extends `tableSizes`.
- Resurrecting or deleting the legacy 3D Blender `TableMap` assets (`packages/client-runtime/table-art/`, `tableArt.ts`, `table.ts` director, `tools/table-art/`).
- Live Activity / Android Live Update seat badges or Share Card seat lines.

## Acceptance criteria

- [ ] All four child specs (`053`–`056`) are implemented and verified against `AGENTS.md` checks (`fmt`, `lint`, `knip`, `typecheck`, `test`) and native iOS/Android checks.
- [ ] Seat selection remains completely optional; starting a session still requires only a buy-in.
- [ ] Seat conflicts on shared tables never block or reject financial buy-in/cash-out sync.
