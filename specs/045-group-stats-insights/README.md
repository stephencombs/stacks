---
status: complete
created: 2026-11-24
tags:
  - stats
  - mobile
  - design
parent: 043-stats-redesign
created_at: 2026-11-24T03:30:28.451991600Z
updated_at: 2026-11-25T02:56:06.595737500Z
completed_at: 2026-11-25T02:56:06.595737500Z
transitions:
  - status: in-progress
    at: 2026-11-24T16:20:07.873172300Z
  - status: complete
    at: 2026-11-25T02:56:06.595737500Z
---

# Group stats: result by trip, and what the crew did together

## Overview

Group Stats (`apps/mobile/src/features/GroupStats.tsx`, with its view model in `packages/client-runtime/src/groupStats.ts`) opens on standings and a running-result race. The race has three problems:

- It turns into grey spaghetti past three players.
- It flattens players at mixed stakes.
- It repeats the standings.

The new view leads with how each trip went and what the crew did at the same tables. It follows the rules in 043.

## Data, with no contract change

It uses `GroupStats.plays`: each finished play's trip, game, venue, start and end, and each group player's `buyIn`, `net` and `milliseconds`. It joins the `GroupDetail.trips` the screen already fetches, for names, order and end dates.

Definitions:

- An **appearance** is one group player at one finished play.
- Two players **share a table** when both have a result at the same play.
- A per-appearance average is the sum of signed results ÷ the number of appearances.
- Plays carry no kind or visit ID, so **no row opens a play**. Destinations are limited to:
  - a standings row opens `StatSheet`;
  - a trip row or bar applies the Trip filter;
  - "All N trips" opens a sheet of trip rows.

  No other row gets a chevron.

## Layout, top to bottom

1. **Filters.** Group (applied), Period or Trip, Game, Casino, and Reset all.
2. **Hero.**
   - Kicker `Group result · {scope}`, with `N players · N tables` (distinct plays).
   - A `type-hero` group Result.
   - "Up on X of Y finished trips". Active trips aren't counted.
   - **Result by trip:** one rounded-cap bar per trip with play in scope, in trip order, around a dashed zero, capped to the latest 8.
     - Each bar has the trip's leader chip at its end. On a tie, the chip is left out.
     - A $0 trip gets a muted marker, not a bar.
     - A bar is tappable only when it's 44pt wide or more. The Trips list is the full path.
   - With an explicit Trip selected, the chart becomes **By night**, using 043's night key and the same tie rules. With fewer than 2 bars, there's no chart.
   - Tiles:
     - Your place (`2nd of 5`; shared ranks show as `=2nd`; "–" with no play);
     - Your Result;
     - Return (the group's Result ÷ buy-ins, `returnLabel`).
3. **Standings.**
   - Rows: rank, 28px `Chip`, name, `N sessions · Xh`, and `Money`. A row opens `StatSheet`.
   - A footnote: "You're 2nd, {Money} behind Sam", "You're in front" or "You're tied for first". It's hidden when you have no play.
   - **Result | Return** sits on its own full-width `Choice` row under the heading, as `Race.tsx` places it today.
     - Return is the total scoped Result ÷ total buy-ins, for players with 3 or more appearances and buy-ins above zero. Ratios are compared by exact cross-multiplication, and ties share a rank.
     - Anyone not ranked is listed after the ranked players.
     - In Return mode, the footnote and the money gap are hidden. The hero place stays based on Result.
     - The switch is hidden when fewer than 2 players qualify.
4. **Together.** Each row shows only at or above its floor; with no row, the section is hidden. Ties on a count go to the more recent shared play.
   - **Most tables together:** two overlapped chips, "{A} and {B}", "N tables together", and their combined Result. Floor: 2 shared plays.
   - **At tables with {friend}:** "You averaged {Money} with {friend} (N), {Money} without (N)". It picks the friend with the largest positive gap, and is hidden if no gap is positive. Floor: 5 of your plays with that friend and 5 without.
   - **You vs {friend}:** the friend you share the most plays with. "Finished higher: you N, {friend} N, N tied." Floor: 5 shared plays.
   - **Everyone finished up:** plays where at least 2 group players all had net above zero. It shows the count and the best one (game · casino · date, with the combined Result). Floor: 1.
   - **Shared tables vs solo:** the per-appearance average at plays with 2 or more group players, against plays with 1 ("one recorded group player"), each with its count. Floor: 5 plays in each.
5. **Trips.** Ended trips, newest first: 4 rows, then "All N trips". Each row shows:
   - the leader's chip, or an overlapped pair chip on a 2-way tie;
   - the trip name;
   - "{name} won {Money} · N tables". On ties it reads "{A} and {B} tied". When the top result is $0 or below, it reads "Highest result".
   - the trip's group Result.

   A trip needs 2 or more players with play. An active trip is listed first, reading "Leading so far", and isn't counted as a win.

   The heading reads "{name} won N of M", counting only ended trips. Co-wins count for each player. It's hidden on a tie for most wins, or with fewer than 2 ended trips.

   With Game or Casino applied, rows read "Top in {slice}", not "won".

   With an explicit Trip selected, this section shows the existing `groupAwards` instead. Each award gets a floor of 2 or more plays.

6. **Habits, After midnight.**
   - The per-appearance average for plays starting from 00:00 up to 06:00 (`TripClock.hour(startedAt)`), against "other start times". Each side shows its count.
   - The summed late Result is shown on the right.
   - Floor: 5 appearances and 3 plays on each side.
7. **Records.** Shown with 2 or more plays.
   - Biggest win (net above zero) and Biggest loss (net below zero).
   - Most time at one table (milliseconds above zero).
   - Best per hour: a player's scoped Result ÷ their elapsed time, with 10h or more played, shown as `{Money}/hr`.
   - Each row shows a chip and "who · game · date". Ties go to the earliest.
8. **By game / By casino.** Shown with 2 or more plays. 044's rows, with "N tables · N appearances" as the meta line.

## Requirements

- [ ] Add pure helpers in `packages/shared/src/stats.ts`, all taking filtered `GroupPlay`s and named floors:
  - `tripResults`
  - `tablemates` (pairs, with/without, head-to-head)
  - `sweeps`
  - `sharedVsSolo`
  - `lateNight`
  - `groupRecords`
  - `returnStandings`
- [ ] `groupStatsView` exposes every section and its hide decision.
- [ ] Delete `Race.tsx` and every helper `knip` then reports unused (`raceLines`, `runningTotals`, `runningReturns`, `around`, `spreadLabels`, …), along with their tests.
- [ ] On Android, `Choice` renders as the Compose segmented row, "All N trips" uses the Android sheet, and headings go through `StatsHeading`.

## Non-goals

- Opening an individual play, which would need a contract change.
- Rank movement between trips, and a two-player line in `StatSheet`.
- Funding sections, which are spec 046.

## Acceptance criteria

- [ ] Unit fixtures, with the sections each should show:
  - **one finished all-positive play with 3 players:** hero (no chart) and standings only;
  - **exactly 4 vs 5 qualifying plays:** the floors switch on;
  - **Return ranks for a known mixed-stakes set,** including an equal-ratio tie;
  - **a tie for first;**
  - **an all-loss trip:** "Highest result";
  - **an all-zero trip:** a muted marker;
  - **an active and a reopened trip:** "Leading so far", not counted;
  - **a 2-way trip tie;**
  - **late-night boundaries** at 00:00, 05:59 and 06:00, and across a DST change.
- [ ] Privacy, accessibility and the states in 043 hold. The trip chart summary names each trip, its Result and its leader.
- [ ] `pnpm fmt`, `lint`, `knip`, `typecheck` and `test` pass.
- [ ] The screen is checked on iOS and Android in light, dark and large text, with VoiceOver and TalkBack.
