---
status: planned
created: 2026-11-14
priority: medium
tags:
  - stats
  - api
  - web
  - mobile
depends_on:
  - "005"
  - "015"
parent: "001"
created_at: 2026-11-14T20:21:33.274322077Z
updated_at: 2026-11-14T20:21:33.274322077Z
---

# Group stats in Stats

## Overview

A group's stats move into the Stats tab as a Group filter, replacing the trip Board as their home, so a group's numbers and yours read the same way. Split from spec 005. The app says "Stats", never "Board".

## Design

- Signed in, a **Group** chip switches `/stats` to that group. No Group chip when signed out.
- **Standings lead:** everyone ranked by result, your row marked, the Group result total under them. A member's row opens their stat sheet: result, sessions, hours, hourly, win rate.
  - Equal results tie and share a rank (1, 2, 2, 4); nothing breaks the tie.
  - A member with no finished sessions in scope sits last at $0.00 with no rank.
- Then everyone's running result and By game and By casino.
- **Awards** show only with a trip picked: Biggest hit, Heater, Comeback kid, Casino hopper, Night owl.
- Counts only sessions recorded in that group (tables in its trips, specs 013 and 015), never device-only play.
- With a group picked, the trip chip lists that group's trips. The trip and group pages' **Stats** buttons and Crew's pinned trip open Stats with group (and trip) picked, in navigation state.
- Offline: the last fetched copy with when it was fetched; with no copy, an unavailable state with a **Just me** button.
- Redirects: `/trips/:id/board`, `/trips/:id/results` and `/groups/:id/stats` open Stats with the group (and trip) picked. Retire the Board page.
- API: extend `GET /groups/:groupId/stats` (`apps/api/src/features/Stats.ts`, all-time only today) with a `tripId` query parameter, per-member stat sheets, and the game and casino breakdowns; standings, ties and awards are pure functions in `packages/shared/src/stats.ts`.
- Designs: `StG*` frames on the 005 · Stats page.

## Plan

- [ ] Standings, ties and awards as shared pure functions, with tests
- [ ] Group stats endpoint returns what the view needs, reading tables in trips
- [ ] Group view on web and mobile, with offline copy
- [ ] Retire the Board page; redirects and mobile linking aliases

## Test

- [ ] Standings match the group's finished results for every filter combination
- [ ] Ties share a rank; members with no sessions in scope list last at $0.00 unranked
- [ ] Never counts device-only play; a removed member loses the group's view (API test)
- [ ] Offline shows the last copy, or the unavailable state
- [ ] Every old Board address lands in Stats with the right group and trip
