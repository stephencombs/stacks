---
status: planned
created: 2026-11-16
priority: high
tags:
  - mobile
  - android
  - design
parent: "019"
created_at: 2026-11-16T17:18:16.142809400Z
updated_at: 2026-11-16T17:18:16.142809400Z
---

# Android shell, Play and Crew match the frames

## Overview

The tab chrome, LiveBar, Play and the Crew pages on Android against their frames. Parent 019 has
the method and global rules.

## Frames

`AndPlay`, `AndMapSoon`, `AndGroups`, `AndTrip`, `AndCrew`, `AndGroupPage` (pages 002 · Tabs and
006 · Crew), light and dark.

## Design

- **Navigation bar** (`features/PlaceTabs.android.tsx`): the frames draw Material 3 Expressive's
  bar, 64dp with a 56×32 indicator and labels on every tab. Today it's the 80dp M3 bar from
  `createNativeBottomTabNavigator`. Spike whether the native bar can take the Expressive style
  (`Widget.Material3Expressive.BottomNavigationView` needs Material Components 1.13+ in the theme,
  through a config plugin, never hand edits to `android/`). If it can't, keep the native bar and
  record the gap. `useTabBarHeight` follows whatever ships.
- **LiveBar** (`features/LiveBar.tsx`, shared): content becomes the frames' content: game chip,
  game, "Resorts World · $300.00 in", elapsed time ("1:48"), live dot. The iOS frames show the
  same, so this is one shared change. Android keeps its solid raised surface with 16dp corners.
- **Play** (`screens/Home.tsx`): the FAB sits 16dp above the LiveBar. Recent-session links
  ("See all") use the link blue. Check the brand header and month card against `AndPlay`.
- **Tab roots have no title.** Remove any Android header title on Crew and Map. The avatar stays at
  the end of the top row, and Crew's **Groups** button stays beside it.
- **Groups** (`AndGroups`): large title with a close icon button at the end; **New group** is an
  extended FAB (56dp, 16dp corners, ink) above the navigation bar, not a full-width button.
- **Trip** (`AndTrip`): back arrow, a tonal **Stats** button and ⋮ in the app bar; kicker line,
  large title, four stat cells, the live session card, then day sections in sentence case.
  **Start a session** is an extended FAB.
- **Group page** (`AndGroupPage`): back, tonal **Stats**, settings icon; large title; People and
  Trips counts; Trips and People sections with blue **New trip** and **Invite**; **Copy link** on
  an unclaimed guest is a tonal button with a link icon.
- **Crew** (`AndCrew`): no LiveBar on Crew. The pinned trip card and activity cards as drawn,
  including a trip-started item with its icon.
- **Pushed pages** (Group settings, Session, Invite, Claim): a large title, as for every pushed page
  (019). Today they have a small inline title and the You chip, which belongs on tab roots only.
- **Map placeholder** (`AndMapSoon`): centred, with its icon.

## Audit findings (2026-11-16)

What the audit found against these frames, beyond the Design above:

- The LiveBar reads "LIVE · Blackjack · since 2:05 PM" and doesn't update when the casino changes.
- Groups opens as a full-screen sheet rather than a page.
- Crew's Groups button sits on a second row.
- The trip card's order, its Stats link and the activity cards differ from the frame.
- The Group page:
  - Splits into Members, Guests, Invite links and Settings sections.
  - Shows a leaderboard card on the live trip.
- The Trip page:
  - Has ⋯ on its own row.
  - Shows a "YOUR TRIP" chart card instead of the four stat cells, and no live session card.
  - Uses "Day 3 · Monday" headers.
  - Has rows without player counts or chevrons.

## Non-goals

- The real Map (spec 012); only its placeholder's chrome is in scope.

## Plan

- [ ] Spike the Expressive navigation bar; ship it or record the gap
- [ ] LiveBar content (shared) and Android surface
- [ ] Play FAB position and link colour
- [ ] Remove titles on Crew and Map tab roots
- [ ] Groups and Trip extended FABs and large titles
- [ ] Group page header and sections
- [ ] Crew without the LiveBar; activity item kinds
- [ ] Large titles on pushed pages
- [ ] Map placeholder

## Test

- [ ] Each frame above matches on the emulator, light and dark (019's protocol)
- [ ] `crew-loop.yaml` and `solo-recording.yaml` pass on Android
