---
status: planned
created: 2026-11-14
priority: medium
tags:
  - api
  - migration
  - mobile
depends_on:
  - "015"
parent: "001"
created_at: 2026-11-14T20:21:34.790856353Z
updated_at: 2026-11-16T03:54:17.491230885Z
---

# Retire the older group sessions

## Overview

With group play recorded from Play (specs 013, 015), the older group sessions (`/trips/:tripId/sessions`, the `sessions` table) become history to move, not a second recorder to maintain. `docs/internals/legacy-migration.md` describes the cutover: freeze recording, import, verify.

## Design

- Freeze new group sessions; existing ones stay readable.
- Import each group session as a table in its trip, keeping ids, amounts, voids, players and provenance. Imported participations that can't establish visit boundaries stay marked as imported (`PLAN.md`, Architecture constraints).
- A read-only preflight lists histories needing reconciliation before cutover.
- Retire the group session recording screen (`apps/mobile/src/screens/Session.tsx` group path) and its endpoints; `/sessions/:id` redirects to the table.
- Stakes and backing stay on the older data until `PLAN.md` phase 5.

## Plan

- [ ] Preflight report on the seeded database and a production copy
- [ ] Import with tests that compare every group's results before and after
- [ ] Freeze, cut over, retire screens and endpoints; redirect `/sessions/:id`

## Test

- [ ] Every group's and player's results are identical before and after
- [ ] Imported sessions keep ids, amounts and void history
- [ ] Old session links land on the imported table
