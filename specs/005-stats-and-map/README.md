---
status: planned
created: 2026-11-13
priority: medium
tags:
  - stats
  - map
  - web
  - mobile
depends_on:
  - "002"
parent: "001"
created_at: 2026-11-13T04:24:59.890272699Z
updated_at: 2026-11-13T04:24:59.890272699Z
---

# Stats and Map tabs

## Overview

Fill the Stats and Map tabs with the player's own play, offline, from the recording store.

## Design

- **Stats `/stats`:** result, hours, hourly and win rate, with breakdown cards; filters for time, game, venue and trip, held in screen state (no query string).
- **Map `/map`:** venue pins colored by result; a pin opens that venue's sessions; a day or trip drawn as a path between venues in order. Mobile uses `expo-maps` (already used by `apps/mobile/src/features/TripRoute.tsx`). Web gets a venue list until its map is chosen.
- Breakdowns, pins and paths are pure functions in `packages/shared` or `packages/client-runtime`; charts follow the no-library rule in `AGENTS.md`.

## Plan

- [ ] Shared stats breakdowns and filters, with tests
- [ ] Stats screens, web and mobile
- [ ] Shared pins and paths, with tests
- [ ] Map on mobile; venue list on web

## Test

- [ ] Stats match finished results for every filter combination (property tests)
- [ ] Losses shown plainly; empty states for no sessions
- [ ] Works signed out and offline
