---
status: in-progress
created: 2026-11-13
priority: medium
tags:
  - stats
  - web
  - mobile
depends_on:
  - "002"
parent: "001"
created_at: 2026-11-13T04:24:59.890272699Z
updated_at: 2026-11-15T05:33:19.638847724Z
transitions:
  - status: in-progress
    at: 2026-11-14T21:41:20.546234145Z
---

# Stats: Just me

## Overview

Fill the Stats tab with the player's own play, from the recording store, so it works signed out and offline. The group view is spec 011 and Map is spec 012; both were split out of this spec. The word is "Result", never "Profit".

## Design

- **Stats `/stats`, Just me:** result, hours, hourly and win rate, a running-result chart, then By game and By casino as inset groups. Filter chips for period, game and casino sit in the top row beside the avatar, held in screen state (no query string). No large page title.
  - The default period is All time.
  - Win rate is the share of finished sessions that came out ahead; break-even sessions count in the total.
  - Dragging the chart reads one session.
  - A live session isn't counted until it finishes; it shows in the LiveBar above the tabs, not on the page.
  - Empty states: no sessions yet, and no sessions match the filters.
- **Trip chip:** appears once a session belongs to a group trip (specs 013, 015). Picking a trip shows the whole trip and replaces the period filter. Trip names come from your groups when signed in; otherwise a trip reads "Group trip".
- Breakdowns are pure functions in `packages/shared` (extend `packages/shared/src/stats.ts`), reading the visits `packages/client-runtime/src/recordingView.ts` already derives. Charts follow the no-library rule in `AGENTS.md` (`@stacks/client-runtime/chart`).
- Designs: the 005 · Stats page of the canvas, `StM*` frames (inset-grouped layout, 4/8/12/16/20/24/32 spacing).

## Plan

- [x] Shared breakdowns and filters (period, game, casino) with unit and property tests
- [x] Stats screen on web
- [x] Stats screen on mobile

## Test

- [x] Stats match finished results for every filter combination (property tests)
- [x] Win rate counts break-even sessions in the total
- [x] Losses shown plainly; both empty states render
- [ ] Works signed out and offline, and after relaunch
