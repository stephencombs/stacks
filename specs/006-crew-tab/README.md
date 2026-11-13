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
updated_at: 2026-11-13T04:25:00.281394705Z
---

# Crew tab, trip and group pages

## Overview

Replace the groups list in Crew with the activity feed, and reshape trip and group pages for the new navigation.

## Design

- **Crew `/crew`:** the current trip pinned on top (who's live, top of its board), then activity from spec 004, each row opening its session or trip. Private to your groups.
- **Trip `/trips/:id`:** its sessions, with its Board at `/trips/:id/board` (This trip | All time).
- **Group `/groups/:id`:** its trips and people; settings at `/groups/:id/settings`.
- **Redirects:** `/trips/:id/results` → board; `/groups/:id/stats` → board's All time; `/groups/:id/people` → the group. Mobile keeps the same paths as linking aliases.

## Plan

- [ ] Crew feed with pinned trip, web and mobile
- [ ] Group page holds people; People page retired
- [ ] Redirects and mobile linking aliases

## Test

- [ ] A member sees activity from all their groups; a removed member sees none of that group's
- [ ] Every old address lands on its new home
