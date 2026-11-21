---
status: complete
created: 2026-11-13
priority: high
tags:
  - navigation
  - web
  - mobile
  - api
created_at: 2026-11-13T03:32:31.830953888Z
updated_at: 2026-11-21T08:08:01.257776200Z
completed_at: 2026-11-21T08:08:01.257776200Z
transitions:
  - status: in-progress
    at: 2026-11-13T04:25:05.274586219Z
  - status: complete
    at: 2026-11-21T08:08:01.257776200Z
---

# Navigation rethink: Play, Stats, Map, Crew

## Overview

Personal play is what people do most, yet it sat outside the app's tabs, and the tab bar was spent on one trip at a time. This umbrella replaces that with four tabs, Play, Stats, Map and Crew, on web and mobile, and brings the screens in line with the Color Up design canvas. `docs/internals/navigation.md` describes the target; each child spec below is one shippable piece of it.

## Children

- 002 Navigation shell: four tabs, You sheet, LiveBar
- 003 Live session data: buy-in total, edits, cash out finishes the visit
- 004 Crew activity API
- 005 Stats: Just me
- 006 Crew tab, trip and group pages
- 007 Color Up design system: tokens, light and dark, glass, motion
- 008 Live screen: the solo felt screen, Finished and delete
- 009 Venues for personal play
- 010 Shared table on the live screen
- 011 Group stats in Stats
- 012 Map
- 013 A table's trip: group play recorded from Play
- 014 iOS Live Activity
- 015 Group reads from tables in trips
- 016 Retire the older group sessions
- 017 Delete a session

## Order

1. Land this spec breakdown first, then 004, 002 and 003 (PRs #85, #86, #87), dropping their own spec edits.
2. The design system (007), so every later screen is built once in the new look.
3. 009, then 008 and 017: the core recording loop.
4. Stats Just me (005).
5. 013, then 015, then 011 and 006, which read group play from tables. 010 can run alongside, after 008.
6. Retire the older group sessions (016) once 015 has shipped.
7. Map (012), then the Live Activity (014).

## Decisions that span children

- Group play is recorded from Play: a shared table can belong to one trip (013). The older group session screens are retired, not restyled.
- The app says "Stats", never "Board". "Result", never "Profit".
- A live session shows in the LiveBar above the tab bar, never at the top of a tab. Tab roots have no large title.
- Deferred, not in any child: strategy tools, the share-your-win card, debts and balances UI, partial cash-outs, a web map, lock-screen actions.

## Test

- [x] Every child spec is complete
- [x] Screenshots of each tab and the live session on web (preview server), iOS and Android, light and dark
