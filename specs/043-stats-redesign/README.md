---
status: complete
created: 2026-11-24
priority: medium
tags:
  - stats
  - mobile
  - api
  - design
depends_on:
  - "011"
created_at: 2026-11-24T03:30:27.095525300Z
updated_at: 2026-11-25T02:56:05.051641600Z
completed_at: 2026-11-25T02:56:05.051641600Z
transitions:
  - status: complete
    at: 2026-11-25T02:56:05.051641600Z
---

# Stats redesign: say it in words, chart only what has a shape

## Overview

Stats answers "How do I do, broken down?" for Just me or one group. Today it has these problems:

- It reads as a dashboard of equal-weight figures.
- A running-result race leads the group view.
- Group mode says little a friend group would talk about.

The redesign keeps the breadth of a dedicated casino tracker: Result, per hour, return, won and lost, best day and length, biggest win and loss, by game and by casino. What changes is how it reads:

- **Figures and sentences first.** Label and value rows, `type-label` tiles and short observational sentences carry most numbers.
- **A chart only where shape matters.** That's the Just me running line, Just me results by month (or by night), and the group's result by trip.
- **Group mode is about the group.** It covers who plays together, who wins trips, how the crew does after midnight or after buying in again, and who backs whom.

The design came from mockup rounds reviewed twice by outside models. The mockups and research are kept outside the repo.

## Children

- `044-stats-just-me-redesign`: Just me. Clients and the shared runtime only.
- `045-group-stats-insights`: the group layout and insights from today's `GroupStats` read. Clients and the shared runtime, with no contract change.
- `046-group-stats-funding`: additional buy-ins, covered buy-ins and backing. Changes the contract, the member-gated server and the clients.

## Rules every child follows

- **Filter scope.** This is the existing behavior:
  - The period is the viewer-local finish year, or a selected Trip, which replaces the year.
  - Game and Casino narrow plays further.
  - Options come from all eligible data.
  - Reset all clears filters but keeps the selected group.
  - Every figure says or inherits its scope. Anything computed over whole trips says "whole trips" when Game or Casino is applied.
- **Clock.** Months, weekdays, nights and "after midnight" use the viewer-local clock (`localClock` / `TripClock`). Nights break at 06:00. Trips store no timezone, so casino-local time is out of scope.
- **Sample floors.** Every comparison or "highest" callout has a named-constant floor, shows its sample size beside it, and hides below the floor. Ties are handled explicitly: they are shared, or the callout is hidden. A row never silently picks one.
- **Observational copy.** Write "Thursdays averaged +$115 across 5 sessions". Never write "pay best", or anything that reads as advice to play more. Strings are sentence case; `type-label` uppercases them.
- **Money.** Amounts are integer minor units. Averages divide with half-away-from-zero rounding, as `hourlyResult` does, so a float never becomes money. Everything renders through `Money` or the privacy-aware formatter, including inline amounts in sentences and accessibility labels.
- **Privacy mode.** It masks every amount, return %, and per-hour figure. Charts turn neutral (`fill-strong`, no win or loss color) and print no values.
- **Accessibility.** Every chart has a plain-language summary and a 44pt list or row path to the same data and actions. Decorative chips inside charts are hidden from assistive tech.
- **States.** Keep loading, signed-out, offline (saved copy and timestamp), load failure with retry, empty, and filtered no-match with Reset all. Loading uses page-shaped skeletons from `ScreenSkeletons.tsx`, replacing the single tall block.
- **Platforms.** Android keeps spec 022's shell: the sticky filter bar, `AndroidGroupChip`/`TripFilter`, `StatsHeading` and its empty states. It uses the new sections, as iOS does. Each platform uses its native controls.
- **Layers.** Pure logic goes in `packages/shared/src/stats.ts` (and `trips.ts`). View models go in `packages/client-runtime/src/stats.ts` and `groupStats.ts`. Screens stay dumb.

## Non-goals

- New recorded data, a casino-local timezone, and enabling stakes on native tables.
- Payments and settle-up history (removed in migration 0019).
- Web (retired), and sharing or exporting stats.

## Acceptance criteria

- [ ] 044, 045 and 046 are each complete against their own criteria.
- [ ] `docs/design/components.md` documents the new parts: trip result bars, month and night bars, and the overlapped pair chip. It also drops the stale `BalanceLabel` mention.
- [ ] `docs/internals/navigation.md` describes the new group Stats order in place of "everyone's running result".
