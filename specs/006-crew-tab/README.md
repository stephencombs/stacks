---
status: planned
created: 2026-11-13
priority: medium
tags:
  - navigation
  - web
  - mobile
depends_on:
  - "002"
  - "004"
parent: "001"
created_at: 2026-11-13T04:25:00.281394705Z
updated_at: 2026-11-14T20:21:30.630115376Z
---

# Crew tab, trip and group pages

## Overview

Replace the groups list in Crew with the activity feed, and reshape trip and group pages for the new navigation. Group play comes from tables in trips (specs 013 and 015); the pinned trip's standings come from spec 011.

## Design

- **Crew `/crew`:** the current trip pinned on top (who's live, and the top of its standings, which open Stats with the group and trip picked), then activity from spec 004, each row opening its session or trip. Private to your groups. A Groups button opens the groups list.
- **Groups list:** a sheet from Crew's **Groups** button (no address; `/groups` still opens Crew). Each group with its people and what's happening (a live trip, when the last trip started). No amounts: debts and balances are deferred, so the balances and stakes UI (`Backing.tsx`, `TripRail.tsx`) isn't carried onto the new pages; its data stays.
- **Trip `/trips/:id`:** your result, sessions, nights and place, then its tables by day, each opening that table; a live table shows who's playing. A **Stats** button opens Stats with the group and trip picked (spec 011). **Start a session** starts a table in this trip (spec 013).
- **Group `/groups/:id`:** its trips and people, with a **Stats** button that opens Stats with the group picked; settings at `/groups/:id/settings`. No "you're owed" figure.
- **Redirects:** `/groups/:id/people` → the group. Board and group stats redirects belong to spec 011. Mobile keeps the same paths as linking aliases.
- Designs: the 006 · Crew page (`CrewFeed`, `Crew`, `Trip`, `GroupPage`).

## Plan

- [ ] Crew feed with pinned trip, web and mobile
- [ ] Groups list without amounts
- [ ] Trip page from tables in the trip
- [ ] Group page holds people; People page retired
- [ ] Redirects and mobile linking aliases

## Test

- [ ] A member sees activity from all their groups; a removed member sees none of that group's
- [ ] The pinned trip's standings match spec 011's
- [ ] Every old address lands on its new home
