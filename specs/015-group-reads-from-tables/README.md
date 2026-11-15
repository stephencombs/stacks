---
status: complete
created: 2026-11-14
priority: high
tags:
  - api
  - stats
  - web
  - mobile
depends_on:
  - "013"
parent: "001"
created_at: 2026-11-14T20:21:34.426654282Z
updated_at: 2026-11-15T21:35:46.031555790Z
completed_at: 2026-11-15T21:35:46.031555790Z
transitions:
  - status: in-progress
    at: 2026-11-15T21:18:38.981749093Z
  - status: complete
    at: 2026-11-15T21:35:46.031555790Z
---

# Group reads from tables in trips

## Overview

Once a table can belong to a trip (spec 013), the group screens must read it. Today trip pages, group stats (`Stats.forGroup` in `apps/api/src/features/Stats.ts`) and Crew activity (#85) read only the older group sessions.

## Design

- **Trip page, group stats and Crew activity** read tables in the group's trips, alongside the older group sessions until spec 016 moves them. Nothing is counted twice: a table imported from a group session is left out, because the session already counts.
- **Players:** a table's players count as the group member holding the same account (spec 013), for visits started while that member was in the group. Each time away is kept when they rejoin (`membership_absences`); absences from before this spec weren't recorded. Anyone else appears on the table, not in standings.
- **A table is live** while any of its visits is; it finishes when the last one does. Only finished tables count in group stats. A player's finished visits stay settled when they sit back down; only the open visit's buy-in is in play. A table's hours are the time anyone was playing, so overlapping visits count once, as a session's hours do.
- **Just me:** the trip chip in Stats (spec 005) reads the trip from each table and replaces the period. The trip path in Map moved to spec 012, which hasn't built Map yet.
- Balances and stakes still read only the older sessions: a trip with an open stake refuses tables (spec 013), and debts are deferred.
- Money stays integer minor units; results come from `packages/shared/src/results.ts` and `packages/shared/src/tripTables.ts`.

## Plan

- [x] Trip page reads tables in the trip
- [x] Group stats endpoint reads tables in trips
- [x] Crew activity reads tables in trips
- [x] Trip chip in Stats Just me, web and mobile
- [x] Trip path in Map: moved to spec 012

## Test

- [x] A table played on a trip shows in the trip page, group stats and Crew, each once
- [x] A linked guest's table play counts toward the member's standing; an unlinked player's doesn't
- [x] A removed member's later tables don't appear; earlier ones keep their results
