---
status: planned
created: 2026-11-24
tags:
- stats
- api
- mobile
depends_on:
- 045-group-stats-insights
parent: 043-stats-redesign
created_at: 2026-11-24T03:30:29.100455400Z
updated_at: 2026-11-24T03:30:29.100455400Z
---

# Group stats: additional buy-ins, covered buy-ins and backing

## Overview

Friend groups buy in again, spot each other's buy-ins and back each other. Color Up records all three: buy-in entries, `counterpartyId` on entries, and stakes. `GroupStats` carries none of them yet.

This spec adds them as optional fields, plus two group-view parts that hide when unused. It follows the rules in 043 and the definitions in 045.

## Contract (`packages/contracts/src/views.ts`)

Every new field uses `Schema.optionalKey`.

- A response or saved copy without these fields still decodes (`packages/client-runtime/src/statsCopy.ts`).
- An absent field means coverage is unknown, so its rows are hidden. It doesn't mean zero.

### `GroupStats.reloads?: Array<{ playId, playerId, additional: Int, net: MinorUnits }>`

- One item per finished, eligible **visit** where `additional` ≥ 1. A legacy player-at-a-session counts as one visit.
- `additional` = max(active buy-in entries − 1, 0).
- Active means `voided_at is null`. A correction voids the original and adds one replacement, so it counts once. A void without a replacement drops out.
- An upward edit to a buy-in total is recorded as a new buy-in, so it counts. The UI therefore says "additional buy-ins", never "rebuys".
- The count must be per visit. A table merges return visits, so a per-table count would turn two single buy-ins into a false extra.
- `allVisits?: Int` counts the eligible finished visits in scope, for context.

### `GroupStats.covered?: Array<{ playId, payerId, playerId, amount: MinorUnits }>`

- Active buy-in entries where the payer isn't the player and both map to group player IDs.
- **Legacy entries:** IDs are already group player IDs, guests included.
- **Native `personal_entries`:**
  - Load the recording players named by `counterparty_id`, not only those named by visits.
  - Map both payer and player through account membership at the visit's start (`TripTables` rules).
  - Drop an entry where either side doesn't map, such as an unlinked table guest.

### `GroupStats.stakes?: Array<{ stakeId, tripId, lenderId, borrowerId, amount: MinorUnits, owed: MinorUnits, final: boolean }>`

- Stakes cover legacy sessions only. Stakes are refused on trips with native tables, and that stays out of scope.
- Reuse the trip ledger's projection (`Views.groupStakes` and `stakeOutcomes`) rather than recomputing it. `owed` matches what the trip ledger shows.
- `final` = the stake has ended (or its trip has) and no covered session is live. Otherwise the row reads "so far".

### Server (`apps/api/src/features/Stats.ts`)

- Count imported legacy sessions once and native facts once, using the existing `legacy_session_id is null` rule in `TripTables.load`.
- The endpoint stays behind `Access.membership`. It returns only scoped aggregates and group IDs, never raw entry IDs.

## Group view

- **Habits, With additional buy-ins.** Placed above After midnight.
  - "N of M visits with an additional buy-in finished up · {name} added the most (N)".
  - Their summed Result is shown on the right.
  - "Most" is the largest sum of `additional`. On a tie, the clause is hidden.
  - Floor: 5 visits.
- **Backing.** The section is hidden when no row qualifies.
  - **{name} covered the most:** "N buy-ins for N friends", with the summed amount as a plain `Money`.
    - Picked by the largest summed amount. Floor: 2 covered entries in scope.
    - The row is static unless one trip is selected; then it opens that trip.
  - **{lender} backed {borrower}:** "{Money} on {trip}", with the backer's Result (`owed − amount`).
    - Reads "so far" when `final` is false.
    - Newest first, 3 rows, then "All N stakes".
- **Scope.**
  - Reloads and covered entries follow the play filters: period, trip, game and casino.
  - Stakes follow the trips that have plays in the period, or the selected trip.
  - With Game or Casino applied, the Backing heading carries "Whole trips".

## Requirements

- [ ] Pure helpers `additionalBuyIns`, `coveredBy` and `backingResults` in `packages/shared/src/stats.ts`, fed through `groupStatsView`.
- [ ] Contracts stay free of runtime logic.

## Non-goals

- Payments and settle-up history.
- Showing balances due. No mobile balances view exists yet.
- Stakes on native tables.
- Changes to how stakes are recorded.

## Acceptance criteria

- [ ] API tests against `stacks_test`:
  - two return visits with one buy-in each give no reload;
  - one visit with an additional buy-in;
  - a multi-step correction counts once;
  - a pure void;
  - a legacy guest payer is included;
  - an unmapped native payer is left out;
  - a linked payer who never sat is included;
  - a former member's past entries keep their history;
  - a non-member is denied;
  - stakes in two trips stay separate;
  - an open stake with no play;
  - an ended stake with a live covered session reads "so far";
  - void and reopen of a stake, and reopen and delete of a visit, all show on the next fetch;
  - mixed legacy, imported and native plays are deduplicated.
- [ ] Client tests:
  - an old saved copy without the fields still decodes, and Backing and the reload row are hidden;
  - complete data with zero funding hides the section;
  - exactly 1 covered entry with no stakes hides Backing.
- [ ] Privacy, accessibility and states as in 043.
- [ ] `pnpm fmt`, `lint`, `knip`, `typecheck` and `test` pass.
- [ ] Checked on iOS and Android.
