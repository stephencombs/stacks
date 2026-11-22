---
status: in-progress
created: 2026-11-22
priority: medium
tags:
  - mobile
  - sheets
  - trips
depends_on:
  - 033-native-bottom-search-casino-picker
parent: 029-ios-ui-polish
created_at: 2026-11-22T19:22:56.010982800Z
updated_at: 2026-11-22T22:34:26.975278300Z
transitions:
  - status: in-progress
    at: 2026-11-22T22:34:26.975278300Z
---

# Table trip field row and searchable trip picker sheet

## Overview

In `Edit my session`, `"Table's trip"` currently floats below the grouped field card as a centered ghost button and opens a small dropdown sheet with a `"Save trip"` button. It should sit inside the grouped field card just like `Buy-in total`, `Started`, `Game`, and `Casino`, and open a full-height searchable selector sheet matching the upgraded casino picker (033).

## Root cause

- `apps/mobile/src/screens/Play.tsx` (`EditSessionSheet`, lines 961–966 and 1041–1046) renders `<TableTripButton>` outside `<List>` instead of a standard `<Row>` with label, current trip value, and trailing chevron.
- `apps/mobile/src/features/TableTrip.tsx` (`TableTripSheet`, lines 79–121) uses a `<Choice presentation="menu">` dropdown inside a short `<Sheet>` with a `"Save trip"` primary button.
- `apps/mobile/src/features/RecordingForms.tsx` (`StartSheet`, line 619) renders `<TripChoice>` as an inline dropdown rather than a consistent field row opening the same picker sheet.

## Design & Requirements

- [x] Add `Trip` as a standard field `<Row>` inside the grouped `<List>` card in `EditSessionSheet` (`apps/mobile/src/screens/Play.tsx`, both iOS and Android) whenever `showTrip` is true and the user is signed in or the table already has a `tripId`:
  - Label: `"Trip"` (matching `"Buy-in total"`, `"Started"`, `"Game"`, `"Casino"`).
  - Value: resolved trip name (e.g. `"Vegas Weekend"` or `"Thursday crew · Vegas Weekend"`, `"Personal · no trip"` when `tripId === null`, or `"Current trip"` fallback while/if group metadata is unavailable), with trailing chevron `>`.
  - Safely read signed-in group/trip names behind `useAccount()` + `StacksProvider` (matching `Map.tsx`'s `TripNames` pattern) so signed-out sessions never mount Clerk/Stacks hooks.
- [x] Build **`TripPickerSheet`** (`apps/mobile/src/features/TableTrip.tsx`) on top of `SearchablePickerSheet` and `PickerRowsSkeleton` (exported from `apps/mobile/src/components/ui/SearchablePickerSheet.tsx` in 033):
  - Opens immediately at full height with the native bottom search bar + clear button when typed.
  - Shows `PickerRowsSkeleton` while `stacks.groups` loads (zero height jump).
  - Lists `"Personal · no trip"` (subtitle: `"Keep this table personal"`) and every compatible open trip from `tableTripOptions` / `groups` (title: trip name, subtitle: group name + `tripDates(trip)`), plus `"Current trip"` if the table is linked to an ended/unlisted trip.
  - Filters rows live by the bottom search query (case-insensitive match against trip name and group name), showing an empty state (`"No trips match “…”"`) when nothing matches.
  - Marks the active selection with a trailing checkmark (`Icon name="check"`).
  - **No `"Save trip"` button:** tapping a row immediately selects it — in `Edit my session`, immediately submits `set_table_trip` with an inline row spinner (`busy` blocks dismissal) and automatically returns to `Edit my session` on success (preserving the sheet with `FormError` on failure).
- [x] Update `StartSheet` (`apps/mobile/src/features/RecordingForms.tsx`) so signed-in users also pick a trip via a matching `"Trip"` field row (showing current value + `>`) opening `TripPickerSheet` with instant return, and remove the obsolete `TableTripButton` and dropdown `TripChoice`.
- [x] Keep `packages/client-runtime/src/recordingView.ts` (`tableTripOptions`, `sessionEditFields`) and its tests consistent; add tests in `apps/mobile/src/screens/Play.test.tsx` (and a focused `TableTrip.test.tsx` if helpful) covering row rendering, search filtering, instant selection/save, and error handling.

## Non-goals

- Creating new trips from inside the picker (trips are still created from Crew / Group pages).
- Changing currency-compatibility rules (`RECORDING_CURRENCY` filtering in `tableTripOptions`).

## Acceptance criteria

- [ ] In `Edit my session`, `Trip` appears inside the same grouped card as `Buy-in total`, `Started`, `Game`, and `Casino`, displaying the current trip (or `"Personal · no trip"`) with a `>` disclosure chevron.
- [ ] Tapping `Trip` opens a full-height searchable sheet identical in chrome, bottom search bar, clear button, and skeleton loading to the casino selector (033).
- [x] There is no `"Save trip"` button; selecting a trip (or `"Personal · no trip"`) immediately persists and returns to `Edit my session` (or updates `StartSheet`).
- [x] Signed-out users do not see the `Trip` row unless the table is already attached to a trip, and offline/failed loads degrade cleanly.
- [x] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, and `pnpm test` pass.
