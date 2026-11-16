---
status: complete
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
updated_at: 2026-11-16T00:10:10.418195050Z
completed_at: 2026-11-16T00:10:10.418195050Z
transitions:
  - status: complete
    at: 2026-11-16T00:10:10.418195050Z
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
- API: `GET /groups/:groupId/stats` (`apps/api/src/features/Stats.ts`) returns every finished session and table in the group's trips, with each member's result and time at it. It takes no `tripId`: trip, game, casino and period all filter on the device, so one offline copy covers every filter. Standings, ties, stat sheets, breakdowns and awards are pure functions in `packages/shared/src/stats.ts` (`groupStats`, `groupAwards`), shaped for both clients by `@stacks/client-runtime/groupStats`. `tripStandings`, which the pinned trip in Crew reads (spec 006), ranks ties the same way.
- The blackjack seat breakdown left with the Board; spec 016 retires the older sessions it read.
- Designs: `StG*` frames on the 005 · Stats page.

## Plan

- [x] Standings, ties and awards as shared pure functions, with tests
- [x] Group stats endpoint returns what the view needs, reading tables in trips
- [x] Group view on web and mobile, with offline copy
- [x] Retire the Board page; redirects and mobile linking aliases

## Test

- [x] Standings match the group's finished results for every filter combination
- [x] Ties share a rank; members with no sessions in scope list last at $0.00 unranked
- [x] Never counts device-only play; a removed member loses the group's view (API test)
- [x] Offline shows the last copy, or the unavailable state
- [x] Every old Board address lands in Stats with the right group and trip
