---
status: planned
created: 2026-11-13
priority: high
tags:
  - navigation
  - web
  - mobile
  - api
created_at: 2026-11-13T03:32:31.830953888Z
updated_at: 2026-11-13T03:32:31.830953888Z
---

# Navigation rethink: Play, Stats, Map, Crew

## Overview

Personal play is what people do most, yet it sits outside the app's tabs. The tab bar is spent on one trip at a time (Sessions, Board, Group). Replace that with four tabs that hold a player's own play first and their friends second, on web and mobile alike. The target is described in `docs/internals/navigation.md`; this spec is the work to get there.

## Design

- **Tabs:** Play · Stats · Map · Crew. The avatar opens a **You** sheet (account, recording defaults, cents, privacy mode, theme, export).
- **Containers:** mobile uses native tabs (`apps/mobile/src/features/PlaceTabs` replaces its trip tabs); web uses a bottom bar below `lg` and a left sidebar above it (`apps/web/src/routes/__root.tsx`).
- **LiveBar:** floats above the tabs while a session is live, everywhere except the session itself.
- **Play `/`:** month result, live card or Start session, `+` (Start live session, Add past session), recent sessions → `/history`, `/history/:year`, `/history/:year-:month`. Personal addresses take no query string (offline shell).
- **Live session `/play/:visitId`:** full screen: elapsed time, buy-in total, game, venue, rebuy chips with undo, Edit (one sheet each for buy-in, start time, game, venue), Cash out.
  - Buy-in sheet adds, subtracts or sets one total; the ledger records a void and replacement.
  - Cash out takes amount and end time and finishes the visit. No Keep playing / Finish choice.
  - A shared table closes once every player at it has cashed out.
- **Stats `/stats`:** result, hours, hourly, win rate; filters for time, game, venue and trip held in screen state.
- **Map `/map`:** venue pins colored by result, pin → that venue's sessions, a day or trip drawn as a path. Mobile uses `expo-maps` (already used by `apps/mobile/src/features/TripRoute.tsx`).
- **Crew `/crew`:** account only. Activity from your groups, newest first, current trip pinned on top. Trip `/trips/:id` (Sessions, Board); group `/groups/:id` (trips, people, settings).
- **Redirects:** `/groups` → `/crew`; `/trips/:id/results` → `/trips/:id/board`; `/groups/:id/stats` → that board's All time; `/groups/:id/people` → `/groups/:id`.

Shared logic (history grouping, stats breakdowns, map pins and paths, buy-in total changes) lives in `packages/shared` or `packages/client-runtime`, not per app.

## Plan

- [ ] Shell: four tabs, You sheet and LiveBar on web and mobile; old routes redirect
- [ ] Play home and history (`/history`, by month and by year)
- [ ] Live session: full screen, per-field edit sheets, buy-in as a total
- [ ] Cash out finishes the visit; shared table closes when the last player cashes out (client-runtime and API)
- [ ] Remove the Keep playing choice from `RecordingForms` and `SessionView` (web) and `RecordingForms` and `Session` (mobile)
- [ ] Stats tab with filters
- [ ] Map tab on mobile with `expo-maps`; web shows a placeholder or list until its map is chosen
- [ ] Crew activity: new contract and API endpoint scoped to the caller's groups, then the Crew list with pinned trip
- [ ] Trip and group pages reached from Crew; retire the Sessions/Board/Group tabs

## Test

- [ ] Play, history and a live session work signed out and offline on web and mobile, and survive relaunch
- [ ] Changing the buy-in total records a void and replacement; result math is unchanged (unit tests in `packages/shared`)
- [ ] Cash out on a one-player table closes it; on a shared table it closes only after the last player cashes out (API tests on the seeded test database)
- [ ] Crew activity returns only sessions and trips from the caller's groups (API authorization test)
- [ ] Every old address redirects to its new home
- [ ] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, `pnpm test` pass; e2e updated for the new flow
- [ ] Screenshots of each tab on web (preview server) and on iOS and Android

## Notes

- Inspired by CasinoIQ screenshots (play, stats, map, feed), reviewed 2026-11-12.
- Out of scope: strategy tools (blackjack strategy, dice probabilities), the share-your-win card, debts and balances UI, partial cash-outs, web map details.
