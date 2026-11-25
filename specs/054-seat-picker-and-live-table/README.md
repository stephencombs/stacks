---
status: planned
created: 2026-11-25
priority: medium
tags:
  - seats
  - mobile
  - design
depends_on:
  - "053"
parent: "052"
created_at: 2026-11-25T05:46:46.139612100Z
updated_at: 2026-11-25T05:52:05.962591300Z
transitions:
  - status: planned
    at: 2026-11-25T05:52:05.962591300Z
---

# Seat selection: tabletop arc picker and live table flows

## Overview

Adds the 2D vector blackjack tabletop arc (`BlackjackTableArc`) and instant seat picker (`SeatPickerSheet`) across iOS and Android recording flows, keeping seat tracking optional while making sitting, moving, and standing up one-tap fast at the table.

## Design & Requirements

### Shared tabletop components (`apps/mobile/src/features`)

- [ ] Build `BlackjackTableArc` (`apps/mobile/src/features/BlackjackTableArc.tsx`) with `react-native-svg` + plain `Pressable` seat nodes:
  - Semicircular blackjack layout with top `DEALER` rail and `5`, `6`, or `7` spots ordered **right-to-left** (`Seat 1` / `1st` on the right = dealer's left; `Seat N` / `3rd` on the left = dealer's right).
  - Supports `surface="felt"` (for live felt screens) and `surface="sheet"` (for light/dark sheets) using **OKLCH tokens only** (`DESIGN.md` rule 1; no hardcoded hex or Tailwind palette colors).
  - States: empty numbered spot, selected / your spot (highlighted with `TableChip` or active ring), occupied by another player (`TableChip` + short name), disabled/pending while saving, and reduced-motion compliant.
  - Every spot has a 44pt minimum hit target (`min-w-11 min-h-11` / `hitSlop`) and an accessible label from `seatLabel(n, totalSeats)` plus occupancy/selection state (`"Seat 1, first base, occupied by Priya"`).
- [ ] Build `SeatPickerSheet` (`apps/mobile/src/features/SeatPickerSheet.tsx`) — keep distinct from existing `SeatSheet` in `LiveTable.tsx`:
  - Renders `BlackjackTableArc`, optional `5 · 6 · 7 seats` segmented `Choice` when `canEditTable` (disabling or surfacing `FormError` if shrinking below a live occupied seat), and `"Leave seat"` / `"Remove seat"` action when seated.
  - Follows `033`/`034` instant-selection pattern (no Save button): tapping an open seat immediately updates the form draft or submits `set_seat` (`busy` blocks dismissal while saving) and returns on success.
  - On finished visits:
    - Unseated: picking a seat records `set_seat` at `visit.startedAt`.
    - Single-seat: picking a different seat atomically replaces it (`replacesSeatingId`, reason `"Seat corrected"`), and `"Remove seat"` calls `void_seating`.
    - Multi-seat: displays the seat path (e.g. `Seat 1 → Seat 3`) and points to visit History to void individual mistakes instead of silently rewriting multi-seat history.

### Recording forms (`apps/mobile/src/features/RecordingForms.tsx`)

- [ ] `StartSheet` and `PastSessionSheet`:
  - When `game === "blackjack"` (and `!watching` on `StartSheet`), show an optional `"Seat"` row inside `DetailsFields` (`Not set`, `Seat 1 · First base`, etc.) opening `SeatPickerSheet` (which also lets the starter choose `5 / 6 / 7` seats). When `watching` (`open_table`), show a `"Table size"` row (`5 / 6 / 7 seats`).
  - Submit `start` / `record_completed` (with `tableSeats` when set), then submit `set_seat` (`occurredAt: startedAt`) if a seat was chosen — matching the existing decoupled `set_table_trip` pattern.
- [ ] `AddPlayerSheet` and `SitDownSheet`:
  - When the table is blackjack (`seatCount(table) !== null`), show an optional `"Seat"` row opening `SeatPickerSheet` with currently occupied live seats shown as taken. Submit `join_table`, then `set_seat` if chosen.

### Live session, Table screen, Edit, and History

- [ ] Live session (`apps/mobile/src/screens/Play.tsx`, `live === true`, blackjack tables):
  - **Solo:** Show a compact tappable seat pill under `LiveHero` metadata (`Seat 3` / `Seat 1 · First base` or `+ Pick seat`) so Rebuy and Cash out stay on the first screen; tapping opens `SeatPickerSheet`.
  - **Shared:** Show compact `BlackjackTableArc` (`surface="felt"`) above `TableSeats` ("At this table"). Tapping an empty spot opens `SeatPickerSheet` or moves you; tapping your spot opens `SeatPickerSheet`; tapping a recordable player's spot opens their `SeatSheet`.
  - Saving a live seat pick, move, or stand-up shows a `RecordingToast` with **Undo** (`void_seating`, reason `"Undone"`), matching the rebuy undo pattern.
- [ ] `TableSeats` and `SeatSheet` (`apps/mobile/src/features/LiveTable.tsx`):
  - Show each player's seat in `TableSeats` rows (e.g. `"Seat 1 · Playing"` or seat badge) so lists provide a complete 44pt accessible alternative to the arc.
  - Add a `"Seat"` row inside `SeatSheet` (when playing at a blackjack table) pushing an in-sheet `"seat"` step with `BlackjackTableArc` so starters/recorders can seat, move, or clear another player.
- [ ] `TableScreen` (`apps/mobile/src/screens/Table.tsx`):
  - For live blackjack tables, render `BlackjackTableArc` (`surface="felt"`) above `TableSeats`, with table-size control accessible for starter/recorders.
- [ ] `EditSessionSheet` (`apps/mobile/src/screens/Play.tsx`, iOS and Android) & `apps/mobile/src/features/visitSheets.ts`:
  - Add `"seat"` to `OpenSheet` and `editChildren`.
  - Show `"Seat"` `<Row>` for all blackjack visits (live or finished, including participants editing their own visit; only the `5/6/7` size control inside `SeatPickerSheet` is gated on `canEditTable`).
- [ ] Finished session & History (`apps/mobile/src/screens/Play.tsx`):
  - Show seat summary (`Seat 3` or `Multiple seats`) in the finished session metadata when set.
  - Render seating timeline rows in `History` (`Sat at Seat 1 · First base`, `Moved to Seat 3`, `Left Seat 3`, with voided rows struck through/muted) and a `SeatingInspector` sheet allowing the user to void a mistaken seating row (with reason).
- [ ] `SharedTableScreen` (`apps/mobile/src/screens/SharedTable.tsx`):
  - Render read-only `BlackjackTableArc` for blackjack tables when anyone is seated, and include seat labels in the Players list.

## Non-goals

- Home (`Home.tsx`) and All Sessions (`History.tsx`) list rows stay uncluttered without seat badges.
- Stats screens and CSV export (`055`, `056`).
- Changing non-blackjack games.

## Acceptance criteria

- [ ] Component and screen tests cover `BlackjackTableArc` (5/6/7 seat ordering, occupied/selected/disabled states, accessibility labels), `SeatPickerSheet` (instant save, shrink guard, live undo, finished correction), `Play.test.tsx`, `Table.test.tsx`, and `SharedTable.test.tsx`.
- [ ] Verified in the native iOS and Android apps in light mode, dark mode, large text, and VoiceOver/TalkBack — including live felt solo & shared views, Rebuy/Cash out visibility on first screen, undo toast, and offline persistence across relaunch.
- [ ] `DESIGN.md` and `docs/design/components.md` updated if a new shared component convention is introduced; `docs/internals/navigation.md` updated only where behavior changed.
- [ ] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, and `pnpm test` pass.
