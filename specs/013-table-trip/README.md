---
status: complete
created: 2026-11-14
priority: high
tags:
  - recording
  - api
  - contracts
  - web
  - mobile
depends_on:
  - "003"
parent: "001"
created_at: 2026-11-14T20:21:34.060804102Z
updated_at: 2026-11-15T20:03:52.447306926Z
completed_at: 2026-11-15T20:03:52.447306926Z
transitions:
  - status: in-progress
    at: 2026-11-15T19:18:15.341056788Z
  - status: complete
    at: 2026-11-15T20:03:52.447306926Z
---

# A table's trip: group play recorded from Play

## Overview

Today tables recorded from Play never belong to a trip (`tripId: null` in `packages/shared/src/recording.ts`, enforced by `requireValid(table.tripId === null, ...)` in `packages/client-runtime/src/recordingState.ts`), and the `tables` table has no trip column. The owner chose one recorder for all play: a table started from Play can belong to one of your groups' trips. This spec adds that link and its permissions. Reading tables in group screens is spec 015; retiring the older group sessions is spec 016. `PLAN.md` phase 4.

## Design

- **A table belongs to zero or one trip**, as a unit: every player's visits, including return visits.
- **Data:** a `trip_id` column on `tables` (new migration in `apps/api/src/db/migrations`), `tripId` on the shared `Table`, and a `set_table_trip` recording command (set, change or clear) in `packages/contracts/src/recordingCommands.ts`.
- **Who:** only the table's starter sets it, and only to a trip of a group they're an active member of. The API (`apps/api/src/features/Recording.ts`) checks membership and that the trip hasn't ended.
- **Choosing:** starting a session, signed in, offers your groups' live trips; a trip page's **Start a session** (spec 006) picks it for you. Signed out, the choice is hidden.
- **Refused offline:** if the push is rejected (trip ended, membership gone), the table stays personal, the rejection shows on the session, and the starter can pick again. Nothing recorded is lost.
- **Players:** a table's players are personal players. In a trip they count as a group member when linked to that member: through the member's account, or a guest's claimed history. Other players at the table show in the table and its results but not in the group's standings.
- **Stakes:** a trip with an open stake refuses tables until whole-Trip backing (`PLAN.md` phase 5) reads them, so backing amounts never miss play.
- **Access:** adding a table to a trip shows its whole-table entries and results to the group's members, and nothing else of its players. Clearing the trip revokes access that came only through it.

## Plan

- [x] Migration, contracts and shared logic for a table's trip, with tests
- [x] API: starter-only, membership, ended-trip and open-stake checks, with tests on the seeded database
- [x] Pick a trip when starting a session, web and mobile; refused choices shown

## Test

- [x] A member sees a table in their group's trip; a non-member and a removed member don't (API tests)
- [x] Changing a table's trip moves all its visits and changes no one's results
- [x] A refused trip choice leaves the table personal and visible as refused
- [x] A trip with an open stake refuses a table
