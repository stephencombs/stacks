---
status: planned
created: 2026-11-14
priority: medium
tags:
  - map
  - web
  - mobile
depends_on:
  - "009"
parent: "001"
created_at: 2026-11-14T20:21:33.691109935Z
updated_at: 2026-11-14T20:21:33.691109935Z
---

# Map

## Overview

The Map tab shows where you've played: venues as pins colored by result, a venue's sessions, and a day or trip drawn as a path. Split from spec 005. Reads the recording store, so it works signed out and offline once venues are cached (spec 009).

## Design

- **Pins:** each venue you've played, colored by your result there (win, loss, even). Tapping a pin opens the venue: name, place, session count, hours, result, then its sessions newest first, linking to each.
- **A day as a path:** a day chip in the top row (for example "Saturday") draws that day's venues numbered in the order you played, with a summary card: venues, time span, result.
- **A trip as a path:** added by spec 015. Until then, days only.
- Mobile uses `expo-maps` (already used by `apps/mobile/src/features/TripRoute.tsx`). Web shows the same data as a venue list; no web map yet.
- Pins and paths are pure functions in `packages/shared`, from visits with a venue and its cached coordinates.
- Sessions without a venue, or a venue without coordinates, are counted in a "no location" line rather than dropped.
- Designs: `MapTab` and `MapVenue` on the 005 · Map page.

## Plan

- [ ] Shared pins and day paths, with tests
- [ ] Map tab on mobile with `expo-maps`
- [ ] Venue list on web

## Test

- [ ] Pin colors match each venue's finished result
- [ ] A day path visits venues in the order played
- [ ] Sessions with no location are counted, not lost
- [ ] Works signed out and offline after venues are cached
