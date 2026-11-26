---
status: in-progress
created: 2026-11-25
priority: medium
tags:
  - seats
  - stats
  - mobile
  - client-runtime
depends_on:
  - "053"
parent: "052"
created_at: 2026-11-25T05:46:46.578709400Z
updated_at: 2026-11-26T05:50:57.865779900Z
transitions:
  - status: planned
    at: 2026-11-25T05:52:06.465023200Z
  - status: in-progress
    at: 2026-11-26T05:50:57.865779900Z
---

# Seat selection: Just me blackjack seat stats and CSV export

## Overview

Brings blackjack seat comparisons, filtering, and pattern insights to Personal Stats (**Just me**) strictly following `PLAN.md` ("Only sessions played entirely in one known seat contribute to that seat's result comparisons. Sessions with changes appear as 'Multiple seats'") and `043-stats-redesign`'s rules, plus adds a `seat` column to personal CSV export.

## Requirements

### Pure stats (`packages/shared/src/stats.ts`)

- [ ] Define `SeatBucket = Seat | "multiple"` (exported from `@stacks/shared/seats` or `@stacks/shared/stats`).
- [ ] Extend `PersonalStatsSession` with optional `seatBucket?: SeatBucket | null` (only populated for `table.game === "blackjack"` via `visitSeatOutcome`; non-blackjack visits always pass `null`).
- [ ] Extend `PersonalStatsFilters` with `seat?: SeatBucket | null | undefined` (`undefined` = all, `1..7` = that single seat, `"multiple"` = multiple seats, `null` = blackjack sessions with no seat recorded).
- [ ] Filter `finished` sessions by `filters.seat` when specified.
- [ ] Return `bySeat` breakdown over finished blackjack sessions in scope where `seatBucket !== null`, ordered spatially (`1`..`N` ascending, then `"multiple"` last), with `{ seat: SeatBucket, result: MinorUnits, sessions: number, hours: number }`, plus `seatedBlackjackSessions` and `totalBlackjackSessions` counts so unseated sessions never shrink seated bars (`sessionShare`).
- [ ] Return `seatBuckets` (single-seat buckets `1..7` only — never `"multiple"`) shaped as `PatternBucket[]` for `leadingBucket` (`PATTERN_MIN_SESSIONS = 5`, `PATTERN_MIN_BUCKETS = 2`, hidden on tie).
- [ ] Include `seats: ReadonlyArray<SeatBucket | null>` in `options` derived from all finished blackjack visits (spatial order `1..N`, `"multiple"`, then `null` if any unseated blackjack visits exist).

### View model & export (`packages/client-runtime`)

- [ ] `packages/client-runtime/src/stats.ts`:
  - Wire `seatBucket` from `RecordedVisit` (`visit.table.game === "blackjack"` + `visit.seatOutcome`) into `personalStats`.
  - Add `"seat"` to `StatsChip["key"]` and emit a `Seat` filter chip in `filterChips` when `(filters.game === "blackjack" || filters.seat !== undefined)` and `options.seats.length > 0`. Picking a non-blackjack `game` clears `filters.seat`.
  - Update `noMatch` copy to describe an active `seat` filter (e.g. `"No finished Blackjack sessions at Seat 3 in 2026."`, `"No finished Blackjack sessions across multiple seats."`).
  - Add seat Patterns sentence (`"Seat 3 averaged +$140 a session, across 6."` / `"First base (Seat 1) averaged …"`) using `leadingBucket` ONLY when scope is blackjack (`filters.game === "blackjack"` or every finished session in scope is blackjack) and `filters.seat === undefined`.
  - Add `bySeat` to `personalStatsView` (null when `filters.seat !== undefined` or no seated blackjack sessions exist in scope): each row carries `label` (`"Seat 1 · First base"`, `"Seat 2"`, …, `"Multiple seats"`), `meta` (`played(sessions, hours)`), `result`, and `filters: { ...filters, game: "blackjack", seat }`, plus a section count (e.g. `"8 of 12 blackjack sessions"` when some lack a seat).
- [ ] `packages/client-runtime/src/export.ts`:
  - Add `"seat"` column to `exportPersonalSessionsCsv`: `""` when non-blackjack or unseated, `"1"`..`"7"` for single seat, `"multiple"` for multiple seats.

### Mobile UI (`apps/mobile`)

- [ ] `apps/mobile/src/features/StatsParts.tsx`:
  - Add `BySeat` component using `ResultRow` + `barTrack(..., { compress: true, minimum: 0.06 })`, full privacy mode masking, and accessible labels/hints matching `ByGame` and `ByCasino` on both iOS and Android.
  - Support the `"seat"` chip in `Filters` (native `FilterChip` on iOS, `StatsMenu` on Android).
- [ ] `apps/mobile/src/screens/Stats.tsx`:
  - Render `<BySeat>` in `Breakdown` when `view.bySeat` is present (below `ByGame` / above `ByCasino`), tapping a row to filter Stats to Blackjack + that seat.

## Non-goals

- Group stats blackjack seat breakdown (`056`).
- High-limit filter/breakdown (separate scope in `PLAN.md`).
- Crediting multi-seat sessions to the longest-held seat (explicitly disallowed by `PLAN.md`).

## Acceptance criteria

- [ ] Unit tests in `packages/shared/src/stats.test.ts` and `packages/client-runtime/src/stats.test.ts` cover: single-seat attribution, `"Multiple seats"` isolation, `[S, null]` exclusion, voided seating ignored, Patterns floor/tie hiding and never picking `"Multiple seats"`, clearing `seat` filter when switching away from Blackjack, privacy mode, and `noMatch` phrasing.
- [ ] Export tests in `packages/client-runtime/src/export.test.ts` verify the `"seat"` column for single seat, multiple seats, unseated blackjack, and non-blackjack sessions.
- [ ] Mobile tests in `apps/mobile/src/screens/Stats.test.tsx` verify `BySeat` rendering, row tap filtering, and `Seat` chip clearing on iOS and Android.
- [ ] Verified in native iOS and Android apps (light, dark, privacy mode, large text).
- [ ] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, and `pnpm test` pass.
