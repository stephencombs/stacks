---
status: complete
created: 2026-11-16
priority: medium
tags:
  - mobile
created_at: 2026-11-16T21:53:44.385062Z
updated_at: 2026-11-19T19:39:03.542966700Z
completed_at: 2026-11-19T19:39:03.542966700Z
transitions:
  - status: in-progress
    at: 2026-11-17T03:18:38.092643700Z
  - status: complete
    at: 2026-11-19T19:39:03.542966700Z
---

# All sessions by month and by year

## Overview

`docs/internals/navigation.md` says All sessions (`/history`) groups by month (`/history/2026-11`)
or year (`/history/2026`), each group headed by its result, hours and session count, with a
`By month | By year` segmented control. The app groups by month only, and the month header wraps
and leaves out hours. Deleted sessions also sit among the rest with no details.

## Design

- `By month | By year` at the top of All sessions changes the grouping, nothing else.
- A group header on one line: period, result, hours, sessions. Live play isn't counted.
  `recordingMonths` in `client-runtime/src/recordingView.ts` already separates finished sessions;
  add the year grouping beside it.
- The month and year routes open with their group in view.
- Deleted sessions follow spec 017: if they're listed, they say so; otherwise they're gone.

## Non-goals

- Filters; Stats does that.

## Plan

- [x] Year grouping in `recordingView` with tests
- [x] Segmented control and headers in `screens/History.tsx`
- [x] Month and year deep links

## Test

- [x] Unit tests for year totals that exclude live play
- [x] Android screenshots, both groupings, light and dark

iOS screenshot verification was waived. Both Android groupings showed the same finished totals.
