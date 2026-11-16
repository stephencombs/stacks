---
status: planned
created: 2026-11-16
priority: medium
tags:
  - mobile
  - android
  - design
parent: "019"
created_at: 2026-11-16T17:18:17.442404400Z
updated_at: 2026-11-16T17:18:17.442404400Z
---

# Android Stats matches the frames

## Overview

Stats on Android, Just me and group, against their frames. Parent 019 has the method and global
rules.

## Frames

Page 005 · Stats: `AndStats`, `AndStMPeriodMenu`, `AndStMTripSheet`, `AndStMTrip`,
`AndStMDrilled`, `AndStMScrub`, `AndStMCasinos`, `AndStMLosingYear`, `AndStMEmpty`,
`AndStMNoMatch`, `AndStGGroupMenu`, `AndStGGroup`, `AndStGGroupLower`, `AndStGGroupTrip`,
`AndStGGroupTripLower`, `AndStGGroupTrips`, `AndStGMember`, `AndStGGroupOffline`,
`AndStGGroupUnavailable`, `AndStGGroupEmpty`, `AndStGGroupNoMatch`, light and dark.

## Design

- **Top row** (`screens/Stats.tsx`): no title. The filter chips scroll in the top row with the
  avatar fixed at its end; the row fills with the card colour once content scrolls under it
  (`AndStGGroupLower`).
- **Filter chips** (`components/ui/FilterChip.native.tsx`, Android path): 32dp tall, 8dp corners,
  outlined, with a drop-down arrow. An applied filter is ink with a clear ✕ that removes it, which
  replaces the iOS black pill. The group chip ("Thursday crew ✕") comes first. **Reset all** sits
  after the chips as a text button.
- **Menus**: period and group open the system dropdown anchored to the chip, with icons, the
  selected item checked, and two-line items for groups.
- **Trip pickers** (`AndStMTripSheet`, `AndStGGroupTrips`): a modal bottom sheet with a radio
  list, the footnote, and a full-width button ("Show 5 sessions").
- **Hero card**: label, figure, an info icon button, "Running result" with **Drag to inspect**,
  the chart, its axis, and four stat cells in one row. While inspecting, a rich tooltip shows the
  date, running total and that session (`AndStMScrub`), and the action reads **Done**.
- **Lists**: section labels uppercase ("BY GAME", "3 games"); game rows with dot, name, sessions,
  bar and amount; casino rows with chevrons; **See all** opens the casinos sheet.
- **Group**: standings with rank, avatar, sessions and result, the group total row, the
  provenance note, the running-result race chart, awards on a trip, by game and by casino.
  Tapping a standing opens the member sheet (`AndStGMember`).
- **States**: offline banner with the cloud-off icon (`AndStGGroupOffline`); empty, unavailable
  and no-match states with a bare icon, headline, body and a wide filled button.

## Audit findings (2026-11-16)

What the audit found against these frames, beyond the Design above:

- **Top of the screen:** about 300dp of empty space sits above the filter row, and the row scrolls
  away.
- **Chips:**
  - Chips are 44dp filled pills.
  - Applied chips show a round × badge.
  - Menus have no icons or subtitles.
  - The trip filter is a dropdown.
- **Hero:**
  - Has no info button.
  - Uses a 2×2 grid.
  - Its tooltip is uppercase with a border.
- **Standings:**
  - Use striped chips and have no chevrons.
  - The "you" row's left border clips at its rounded corners.
  - The provenance note is missing.
  - The member sheet's layout differs.
- **The race chart** adds a headline and a Money / % of buy-in toggle, and greys out the other
  players. The frame has neither. Drop them, or put them on the canvas first (019).
- **Empty and no-match states** sit in cards with other copy, and **Change game** is missing.
- **Section headers** are sentence case, and the casinos list shows 2 before See all.
- **Offline states** (`features/GroupStats.tsx:58-85`) don't follow `AndStGGroupOffline` or
  `AndStGGroupUnavailable`.

## Non-goals

- New statistics or API changes; this is presentation only.

## Plan

- [ ] Top row with chips and avatar; scrolled fill
- [ ] Android filter chip look and applied state with clear
- [ ] Period and group dropdown menus
- [ ] Trip radio sheets
- [ ] Hero card, inspect tooltip
- [ ] Lists and group sections
- [ ] Offline, empty, unavailable and no-match states

## Test

- [ ] Each frame above matches on the emulator, light and dark (019's protocol)
