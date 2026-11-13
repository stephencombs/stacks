---
status: in-progress
created: 2026-11-13
priority: high
tags:
  - navigation
  - web
  - mobile
parent: "001"
created_at: 2026-11-13T04:24:58.726712269Z
updated_at: 2026-11-13T04:39:07.802951763Z
---

# Navigation shell: four tabs, You sheet and LiveBar

## Overview

First step of spec 001. Put the four tabs (Play, Stats, Map, Crew) around the app on web and mobile, so every later step has its place. Today's screens move into the tabs as they are.

## Design

- **Signed out works.** The tabs render with no account and no network. Play, Stats and Map never wait for sign-in. Crew asks for sign-in inside the tab instead of blocking the app.
- **Play** is the current personal home (`/`). **Crew** holds the current groups list at `/crew`; groups, trips, sessions, people and settings are pushed inside it. **Stats** (`/stats`) and **Map** (`/map`) are placeholders until spec 005.
- **Outside the tabs:** the live session `/play/:visitId` fills the screen; `/t/:token`, `/invite/:token`, `/join/:code` and `/claim/:code` keep their own frames.
- **You** opens from the avatar on every tab, signed in or out: theme always, account actions when signed in, sign-in when not.
- **LiveBar** shows your live personal session (from the recording store) above the tabs, everywhere except that session. On Crew's pages, a live seat at a group table shows when there's no personal one; Play, Stats and Map ask nothing of the network.
- **Trip pages** lose the Sessions/Board/Group tabs; a trip links to its Board, and the scope switcher goes away.
- **Redirect:** `/groups` → `/crew`. Mobile registers old addresses as their own screens, since a linking alias drops typed params for the whole stack. Other redirects wait for spec 006.
- Web: `apps/web/src/routes/__root.tsx` and `apps/web/src/features/Shell.tsx` (bottom bar below `lg`, sidebar above). Mobile: `apps/mobile/src/App.tsx` and `apps/mobile/src/features/PlaceTabs*` (native tabs on iOS, bar on Android).

## Plan

- [x] Web: one shell around personal and account routes, tabs, You, LiveBar
- [x] Web: `/stats`, `/map`, `/crew` routes; `/groups` redirects
- [x] Mobile: root tabs with one stack per tab; Play visit, Join and Claim above the tabs
- [x] Mobile: Crew stack holds the group and trip screens; scope header removed
- [x] Both: trip page links to its Board

## Test

- [ ] Signed out and offline, Play, Stats and Map open from the tabs; Crew shows sign-in
- [ ] Signed in, Crew → group → trip → session and back work; old trip and group links still open
- [ ] LiveBar appears while a personal session is live and hides on that session
- [x] `pnpm fmt`, `lint`, `knip`, `typecheck`, `test` pass; web e2e updated
- [ ] Screenshots: web (preview server) narrow and wide; mobile web build

## Notes

- Out of scope: new screen content (specs 003, 005, 006) and the Crew activity feed (spec 004).
