---
status: planned
created: 2026-11-24
tags:
- stats
- mobile
- design
parent: 043-stats-redesign
created_at: 2026-11-24T03:30:27.810630600Z
updated_at: 2026-11-24T03:30:27.810630600Z
---

# Stats: Just me redesign

## Overview

Rework Just me (`JustMe` / `Breakdown` in `apps/mobile/src/screens/Stats.tsx`, with view models in `packages/client-runtime/src/stats.ts`). The new shape is one hero, then rows and sentences, with two charts. It follows the rules in 043.

## Layout, top to bottom

1. **Filters.** The existing chips and Reset all.
2. **Hero.** It follows `TripHero`'s visual rules but isn't `TripHero` itself.
   - Kicker `Result · {scope}` with `N sessions · Xh Ym`.
   - A `type-hero` `Money` with `tone="result"`.
   - A climb line, "Up {Money} from your low". It shows only when a negative checkpoint is followed by a higher finish.
   - The existing `RunningChart`, restyled to the hero (result color, fill to break-even, a halo on the last point). It keeps drag-to-inspect and VoiceOver/TalkBack `adjustable`. Points follow finish order; the first and last dates sit in the corners.
   - Tiles:
     - Per hour (shows "–" with no elapsed time);
     - Win rate (won ÷ played; shows "–" with no sessions);
     - Return (`returnLabel`, 0 decimals; shows "–" with no buy-ins; colored by sign, muted at zero).
3. **Money.** One `Surface`:
   - Won and Lost tiles (`type-number-lg`) with session counts, plus "N even" when there are any.
   - Rows for Bought in and Cashed out, plus Adjustments when it isn't zero.
   - Result isn't repeated. Result = cash-outs + adjustments − buy-ins, from `VisitSummary.totals`.
4. **By month.**
   - A sentence: "{Month} was your best month at {Money}." It shows only if that month is above zero. "{Month} was your worst at {Money}." shows only if that month is below zero.
   - Rounded-cap bars around a dashed zero. The best and worst bars are solid and the rest are at 35%. A played month that broke even gets a muted dot. An unplayed month gets only its label, in `faint`.
   - Window:
     - With a Year filter, Jan to the current or last month of that year.
     - With All time, the trailing 12 months ending at the latest played month, with the year on the first label and at a January.
   - Shown only with 3 or more played months in the window.
   - With a Trip filter, the chart becomes **By night** (06:00 break) and is shown with 2 or more nights.
5. **Patterns.**
   - The sentences are "{Weekday}s averaged {Money} a session, across N" and "{Bucket} sessions averaged {Money}, across N".
   - Weekday is taken from the start time. Buckets are [0,1h), [1h,2h), [2h,3h) and [3h,∞).
   - Each sentence names the highest average, whatever its sign. It needs 5 or more sessions in that bucket and 2 or more qualifying buckets, and is hidden on a tie.
   - With no sentence, the section is hidden.
6. **Records.** Biggest win needs net above zero; Biggest loss needs net below zero.
   - Each row shows game · casino · date and its `Money`, and opens the session in Play by `VisitId`.
   - With neither, the heading is hidden.
7. **By game / By casino.** The existing `ByGame`/`ByCasino`:
   - Both platforms use `ResultBar` with `barTrack(…, { compress: true, minimum: 0.06 })`. This changes Android's share bar and adds the bar to Android's casino rows.
   - `TOP_CASINOS` becomes 4, then "See all".
   - Every `Game` value is supported, including "No game set".

The inline "Sessions" / "Matching sessions" list shown at 3 or fewer sessions is removed. Play history owns it.

## Requirements

- [ ] `personalStats` takes `VisitSummary.totals` and `startedAt`, and returns:
  - won and lost sums and counts, and the even count;
  - buy-ins, cash-outs and adjustments;
  - `climb: MinorUnits | null`;
  - `hourlyResult: MinorUnits | null`, null when there's no elapsed time;
  - month and night results that tell played from unplayed;
  - weekday and length buckets with their counts;
  - biggest win and biggest loss, each nullable.
- [ ] A night-key helper in `packages/shared/src/trips.ts`, shared with 045. `tripNights` doesn't take personal visits as they are.
- [ ] Floors and bucket edges are named constants.
- [ ] The month chart and night chart each have a summary label, and a label for each bar with its exact signed amount, or "no play" or "even".

## Non-goals

- A calendar or day list; Play history owns that.
- Comparing against a previous period.

## Acceptance criteria

- [ ] Unit tests cover:
  - one session: no charts, no Patterns, and only the record that matches its sign;
  - all wins: no climb line and no Biggest loss;
  - all losses;
  - a tie between two buckets: that sentence is hidden;
  - exactly 2 and exactly 3 played months;
  - a non-zero adjustment;
  - zero duration with a real Result;
  - zero buy-ins.
- [ ] Privacy mode masks the hero, tiles, climb line, sentences, records and breakdowns, and neutralizes both charts.
- [ ] Signed-out, offline, load failure, empty, and no-match with Reset all all still render. Loading shows a page-shaped skeleton.
- [ ] `pnpm fmt`, `lint`, `knip`, `typecheck` and `test` pass.
- [ ] The screen is checked on iOS and Android in light, dark and large text, with VoiceOver and TalkBack.
