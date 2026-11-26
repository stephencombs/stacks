---
status: in-progress
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
updated_at: 2026-11-26T05:50:56.956553600Z
transitions:
  - status: planned
    at: 2026-11-25T05:52:05.962591300Z
  - status: in-progress
    at: 2026-11-26T05:50:56.956553600Z
---

# Seat selection: tabletop arc picker and live table flows

## Overview

Adds the 2D vector blackjack tabletop arc (`BlackjackTableArc`) and instant seat picker (`SeatPickerSheet`) across iOS and Android recording flows, keeping seat tracking optional while making sitting, moving, and standing up one-tap fast at the table.

## Design & Requirements

### Shared tabletop components (`apps/mobile/src/features`)

- [ ] Build `BlackjackTableArc` (`apps/mobile/src/features/BlackjackTableArc.tsx`) with `react-native-svg` + plain `Pressable` seat nodes for seat selection:
  - High-fidelity 2D casino blackjack tabletop layout with dealer station, felt details, curved rail, and `5`, `6`, or `7` spots ordered **right-to-left** (`Seat 1` / `1st` on the right = dealer's left; `Seat N` / `3rd` on the left = dealer's right), framed cleanly for light and dark sheets (`DESIGN.md` rule 1 exempts drawn casino art).
  - States: empty numbered spot, selected / your spot(s) via `selectedSeats` (highlighted ring + `"Selected"` pill when a single unoccupied spot is selected), occupied by another player (`PlayerAvatar` + short name) or by you on multiple spots, disabled/pending while saving, and reduced-motion compliant.
  - Every spot has a 44pt minimum hit target (`size-11` / `hitSlop`) and an accessible label from `seatLabel(n, totalSeats)` plus occupancy/selection state (`"Seat 1, first base, occupied by Priya"`).
- [ ] Build `SeatPickerSheet` (`apps/mobile/src/features/SeatPickerSheet.tsx`) — keep distinct from existing `SeatSheet` in `LiveTable.tsx`:
  - Renders `BlackjackTableArc`, optional `5 · 6 · 7 seats` segmented `Choice` when `canEditTable` (disabling or surfacing `FormError` if shrinking below a live occupied seat), explicit primary confirm button (`Save Seat X`, `Save Seats 1 & 2`, `Use Seat X`, `Use Seats 1 & 2`, `Leave seat(s)`), and secondary `"Leave seat"` / `"Remove seat"` / `"Clear seat"` action when seated.
  - Supports simultaneous multi-spot selection: tapping spots toggles them in the draft selection (`selectedSeats`), and pressing the primary button updates the form draft or submits `set_seat` (`busy` blocks dismissal while saving) and returns on success.
  - On finished visits:
    - Unseated: picking one or more seats records `set_seat` at `visit.startedAt`.
    - Single snapshot (one seat or simultaneous multi-spot): changing seats atomically replaces it (`replacesSeatingId`, reason `"Seat corrected"`), and removing seat(s) calls `void_seating`.
    - Multi-snapshot history: displays the seat path and points to visit History to void individual mistakes instead of silently rewriting history.

### Recording forms (`apps/mobile/src/features/RecordingForms.tsx`)

- [ ] `StartSheet` and `PastSessionSheet`:
  - When `game === "blackjack"` (and `!watching` on `StartSheet`), show an optional `"Seat"` row inside `DetailsFields` (`Not set`, `Seat 1 · First base`, etc.) opening `SeatPickerSheet` (which also lets the starter choose `5 / 6 / 7` seats). When `watching` (`open_table`), show a `"Table size"` row (`5 / 6 / 7 seats`).
  - Submit `start` / `record_completed` (with `tableSeats` when set), then submit `set_seat` (`occurredAt: startedAt`) if a seat was chosen — matching the existing decoupled `set_table_trip` pattern.
- [ ] `AddPlayerSheet` and `SitDownSheet`:
  - When the table is blackjack (`seatCount(table) !== null`), show an optional `"Seat"` row opening `SeatPickerSheet` with currently occupied live seats shown as taken. Submit `join_table`, then `set_seat` if chosen.

### Live session, Table screen, Edit, and History

- [ ] Live session (`apps/mobile/src/screens/Play.tsx`, `live === true`, blackjack tables):
  - Show a compact tappable seat pill under `LiveHero` metadata (`Seat 3`, `Seat 1 · First base`, `Seats 1 & 2`, or `+ Pick seat`) on both solo and shared live tables — no table map or total seat count is shown on the live felt; tapping opens `SeatPickerSheet`.
  - When shared, show `TableSeats` ("At this table") with each player's seat on their row. Tapping a recordable player's row opens their `SeatSheet`.
  - Saving a live seat pick, move, or stand-up shows a `RecordingToast` with **Undo** (`void_seating`, reason `"Undone"`), matching the rebuy undo pattern.
- [ ] `TableSeats` and `SeatSheet` (`apps/mobile/src/features/LiveTable.tsx`):
  - Show each player's seat in `TableSeats` rows (e.g. `"Seat 1 · Playing"` or `"Seat 1 · First base · Playing"`).
  - Add a `"Seat"` row inside `SeatSheet` (when playing at a blackjack table) pushing an in-sheet `"seat"` step with `BlackjackTableArc` so starters/recorders can seat, move, or clear another player.
- [ ] `TableScreen` (`apps/mobile/src/screens/Table.tsx`):
  - Show each player's seat on their row in `TableSeats` (no table map or total seat-count pill on the live table screen). Table size remains editable from `SeatPickerSheet` and `TableSettingsSheet`.
- [ ] `EditSessionSheet` (`apps/mobile/src/screens/Play.tsx`, iOS and Android) & `apps/mobile/src/features/visitSheets.ts`:
  - Add `{ type: "seat", from: "edit" }` so closing or saving from Edit returns to Edit while closing or saving from the live-felt pill returns straight to the felt.
  - Show `"Seat"` `<Row>` for all blackjack visits (live or finished, including participants editing their own visit; only the `5/6/7` size control inside `SeatPickerSheet` is gated on `canEditTable`).
- [ ] Finished session & History (`apps/mobile/src/screens/Play.tsx`):
  - Show seat summary (`Seat 3` or `Multiple seats`) in the finished session metadata when set.
  - Render seating timeline rows in `History` (`Sat at Seat 1 · First base`, `Moved to Seat 3`, `Left Seat 3`, with voided rows struck through/muted) and a `SeatingInspector` sheet allowing the user to void a mistaken seating row (with reason).
- [ ] `SharedTableScreen` (`apps/mobile/src/screens/SharedTable.tsx`):
  - Include each player's seat label on their row in the Players list (no table map shown on the viewer page).

## Non-goals

- Home (`Home.tsx`) and All Sessions (`History.tsx`) list rows stay uncluttered without seat badges.
- Stats screens and CSV export (`055`, `056`).
- Changing non-blackjack games.

## Acceptance criteria

- [ ] Component and screen tests cover `BlackjackTableArc` (5/6/7 seat ordering, occupied/selected/disabled states, accessibility labels), `SeatPickerSheet` (instant save, shrink guard, live undo, finished correction), `Play.test.tsx`, `Table.test.tsx`, and `SharedTable.test.tsx`.
- [ ] Verified in the native iOS and Android apps in light mode, dark mode, large text, and VoiceOver/TalkBack — including live felt solo & shared views, Rebuy/Cash out visibility on first screen, undo toast, and offline persistence across relaunch.
- [ ] `DESIGN.md` and `docs/design/components.md` updated if a new shared component convention is introduced; `docs/internals/navigation.md` updated only where behavior changed.
- [ ] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, and `pnpm test` pass.
