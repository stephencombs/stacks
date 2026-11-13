---
status: in-progress
created: 2026-11-13
priority: high
tags:
  - recording
  - web
  - mobile
  - api
depends_on:
  - "002"
parent: "001"
created_at: 2026-11-13T04:24:59.125611136Z
updated_at: 2026-11-13T05:26:32.385377986Z
transitions:
  - status: in-progress
    at: 2026-11-13T05:26:32.385377986Z
---

# Live session: full screen, buy-in total and cash out

## Overview

Make recording a live session match `docs/internals/navigation.md` and the cash-out rules in `PLAN.md`: cash out finishes the visit, and the buy-in is edited as one total.

## Design

- `/play/:visitId` while live: elapsed time, buy-in total, game, venue, rebuy chips with undo, **Edit** and **Cash out**.
- Edit opens one sheet per field: buy-in, start time, game, venue. The buy-in sheet adds, subtracts or sets the total; `packages/client-runtime` turns that into voids and a replacement entry.
- Cash out takes the amount and end time and finishes the visit. Remove the Keep playing choice: `apps/web/src/features/RecordingForms.tsx`, `apps/web/src/features/SessionView.tsx`, `apps/mobile/src/features/RecordingForms.tsx`, `apps/mobile/src/screens/Session.tsx`.
- A shared table closes once every player at it has cashed out (client-runtime recording and `apps/api` recording service).

## Plan

- [ ] Buy-in total change as ledger corrections (shared logic + tests)
- [ ] Cash out finishes the visit; table closes after the last player
- [ ] Live session screen and edit sheets, web and mobile
- [ ] Remove Keep playing everywhere

## Test

- [ ] The `PLAN.md` phase 2 milestone passes end to end, offline, on web and mobile
- [ ] Buy-in total changes keep void history visible; result math unchanged (unit and property tests)
- [ ] API tests: a one-player table closes on cash-out; a shared table closes only after the last player
- [ ] Mistaken cash-out can be undone without merging a real return visit
