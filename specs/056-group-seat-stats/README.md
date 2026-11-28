---
status: in-progress
created: 2026-11-25
priority: medium
tags:
  - seats
  - stats
  - api
  - mobile
depends_on:
  - "053"
  - "055"
parent: "052"
created_at: 2026-11-25T05:46:47.013539700Z
updated_at: 2026-11-26T05:50:58.782517600Z
transitions:
  - status: planned
    at: 2026-11-25T05:52:06.962304500Z
  - status: in-progress
    at: 2026-11-26T05:50:58.782517600Z
---

# Seat selection: Group stats blackjack seat breakdown

## Overview

Restores blackjack seat breakdowns in Group Stats (retired alongside the old Board in `011`/`016`) using per-visit seat outcomes from both new tables (`personal_seatings`) and legacy group sessions (`seatings`), strictly applying `PLAN.md`'s single-seat vs. `"Multiple seats"` rule.

## Requirements

### Contracts (`packages/contracts/src/views.ts`)

- [ ] Add optional `seatPlays` (or `seats`) array to `GroupStats` (following `046`'s `reloads`/`allVisits` optional-key pattern so older responses degrade gracefully by hiding the section):
  - Each item represents one finished blackjack visit (or legacy session participation) by a group member: `{ playId: SessionId | TableId, playerId: PlayerId, seat: Seat | "multiple", net: MinorUnits, milliseconds: Schema.Int }`.
  - Unseated blackjack visits are omitted (or counted via existing visit totals) so missing seats never shrink bars.

### Server (`apps/api`)

- [ ] `apps/api/src/features/TripTables.ts`:
  - Load non-voided `personal_seatings` for loaded tables (`deleted_at is null`), compute `visitSeatOutcome` per finished member visit (including separate return visits at the same table!), and expose per-visit seat outcomes on loaded tables.
- [ ] `apps/api/src/features/Stats.ts`:
  - Load legacy `seatings` for closed blackjack `sessions` in the group and classify each `(session_id, player_id)` with the same `visitSeatOutcome` rule (NOT the retired longest-held rule).
  - Combine legacy and table blackjack member seat outcomes into `GroupStats.seats` (member-gated, only finished plays in the group's trips, never device-only play).

### Shared, client-runtime, and mobile

- [ ] `packages/shared/src/stats.ts`: add pure aggregation helper for group blackjack seat breakdown over plays matching active group filters (`year`/`tripId`, `game`, `venueId`) using `BREAKDOWNS_MIN_PLAYS` / sample rules consistent with `043`/`045`.
- [ ] `packages/client-runtime/src/groupStats.ts`: expose `bySeat` on `groupStatsView` when `stats.seats` is present and filtered blackjack plays have seat data (spatial order `Seat 1 · First base`..`Seat N`, then `Multiple seats`). Missing `stats.seats` hides the section rather than showing zero.
- [ ] `apps/mobile/src/features/GroupStats.tsx`: render `<BySeat>` (reusing `StatsParts.tsx` from `055`) in `ShownStats` on iOS and Android, with privacy mode and offline saved-copy support.

## Non-goals

- Per-player seat drill-down inside `StatSheet`.
- Filtering the entire Group Stats screen by seat (keep group filters to Group, Period/Trip, Game, Casino).

## Acceptance criteria

- [ ] API tests in `apps/api/src/features/StatsFunding.test.ts` (or a new `StatsSeats.test.ts`) verify member gating, return visits counted per visit, legacy `seatings` using `visitSeatOutcome` (multi-seat classified as `"multiple"`, not longest-held), and exclusion of live/deleted/device-only visits.
- [ ] Unit tests in `packages/shared/src/groupStats.test.ts` and `packages/client-runtime/src/groupStats.test.ts` verify filter scoping, spatial ordering, missing-field graceful hiding, and privacy mode.
- [ ] Verified on iOS and Android in light, dark, offline saved-copy, and privacy mode.
- [ ] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, and `pnpm test` pass.
