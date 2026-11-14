---
status: planned
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
updated_at: 2026-11-14T20:21:34.426654282Z
---

# Group reads from tables in trips

## Overview

Once a table can belong to a trip (spec 013), the group screens must read it. Today trip pages, group stats (`Stats.forGroup` in `apps/api/src/features/Stats.ts`) and Crew activity (#85) read only the older group sessions.

## Design

- **Trip page, group stats and Crew activity** read tables in the group's trips, alongside the older group sessions until spec 016 moves them. Nothing is counted twice.
- **Players:** a table's players count as the group member they're linked to (spec 013); unlinked players appear on the table, not in standings.
- **Just me:** the trip chip in Stats (spec 005) and the trip path in Map (spec 012) appear, reading the trip from each table.
- Money stays integer minor units; results come from `packages/shared/src/results.ts`.

## Plan

- [ ] Trip page reads tables in the trip
- [ ] Group stats endpoint reads tables in trips
- [ ] Crew activity reads tables in trips
- [ ] Trip chip in Stats Just me, web and mobile
- [ ] Trip path in Map

## Test

- [ ] A table played on a trip shows in the trip page, group stats and Crew, each once
- [ ] A linked guest's table play counts toward the member's standing; an unlinked player's doesn't
- [ ] A removed member's later tables don't appear; earlier ones keep their results
