---
status: in-progress
created: 2026-11-22
priority: high
tags:
  - mobile
  - ios
  - sheets
  - venues
parent: 029-ios-ui-polish
created_at: 2026-11-22T19:22:55.519966300Z
updated_at: 2026-11-22T22:11:04.783801100Z
transitions:
  - status: in-progress
    at: 2026-11-22T22:11:04.783801100Z
---

# Full-height casino selector with native bottom search bar, instant selection, and pixel-perfect skeleton

## Overview

The casino selector still fails the intended UX in four ways: `Edit my session -> Casino` uses a completely different half-height sheet with a top search box and `"Save casino"` button; `CasinoPickerSheet` hand-rolls a custom `<GlassSurface><TextInput />` + permanent `×` button instead of a native iOS 26 bottom search bar; tapping a casino in Edit requires pressing a separate Save button instead of returning immediately; and loading shows `"Searching…"` / `"Near me"` flashes instead of opening straight to full height with a pixel-perfect row skeleton.

## Root cause

- `apps/mobile/src/screens/Play.tsx` (line 746) opens `VenueSheet` (`apps/mobile/src/features/RecordingForms.tsx:1354-1404`), which wraps `<SessionVenuePicker>` inside a standard `<RecordingSheet title="Casino" submitLabel="Save casino">` instead of `CasinoPickerSheet`.
- `apps/mobile/src/features/VenuePicker.tsx` (`FloatingCasinoSearchBar`, lines 49–93) builds a fake search bar out of `<GlassSurface>` + `<TextInput>` + a permanent `<ControlSurface>` close button instead of iOS 26's native bottom search bar (which shows the native clear button to the right when text is typed).
- `SessionVenuePicker` (`VenuePicker.tsx:249-337`) initializes `near = null` while `Location.getForegroundPermissionsAsync()` and GPS resolve asynchronously, making `appleSearching` false during initial load and flashing `"Near me"` and `"Searching…"` text instead of a full-height skeleton.

## Design & Requirements

- [x] Build a reusable full-height **`SearchablePickerSheet`** (`apps/mobile/src/components/ui/SearchablePickerSheet.tsx` and `.ios.tsx`) designed to power both Casino (033) and Trip (034) pickers:
  - **Immediate full height:** Opens straight to full height (`large` / `detents={[1]}` on iOS, full sheet height on Android) on frame 1 with zero height jump.
  - **Native iOS 26 bottom search bar:** Use a real native iOS 26 bottom-placed search bar — never a fake RN `<TextInput>` inside `<GlassSurface>`. Note that stock `react-native-screens@~4.30.1` does _not_ include T3 Code's fork-only `mailSearchToolbar`/`unstable_headerToolbarItems` API, so spike in order: (1) `@expo/ui/swift-ui` `NavigationStack` + `searchable` + `Toolbar` inside a full-height sheet, (2) stock `react-native-screens` `<SearchBar placement="integrated" allowToolbarIntegration />` inside a `ScreenStack`/`FormSheet`, and only if neither places a native bottom search bar on iOS 26, (3) a minimal local Expo module view wrapping `UISearchBar` in `apps/mobile/modules/` (note: adding native code requires a new dev build via `expo run:ios` / `pnpm eas:dev`).
  - **Native clear button behavior:** When the query is empty, no stray clear button sits beside it; as soon as text is typed, the native clear button appears to the right of the search bar and clears the query on tap. The search bar tracks the keyboard smoothly, and the sheet remains cleanly dismissible (native swipe-down grabber and/or back affordance).
  - **Android bottom search bar:** Full-height sheet with a clean Material bottom search bar that reveals a trailing clear button when text is non-empty and tracks the keyboard cleanly.
  - **Shared contract (consumed by 034 `TripPickerSheet`):** Export `SearchablePickerSheet` (`open`, `title`, `placeholder`, `query`, `onQueryChange`, `loading`, `busy`, `error`, `onClose`, `children`) and `PickerRowsSkeleton` so 034 reuses the exact chrome, search bar, and skeleton with zero duplication.
- [x] Build a **pixel-perfect `PickerRowsSkeleton`** matching the exact `<List>` + `<Row className="py-4">` geometry (`rounded-[22px] bg-raised` inside sheet, `px-4 py-4`, `border-t border-line`, `gap-0.5`, title line box `h-[22px]` matching `type-heading`, subtitle line box `h-[18px]` matching `type-footnote`, 7–8 varied-width rows filling the sheet) so real results swap in 1:1 with zero vertical shift.
- [x] Refactor `CasinoPickerSheet` and `SessionVenuePicker` (`apps/mobile/src/features/VenuePicker.tsx`):
  - Keep native Apple Maps (`MKLocalSearch` via `apps/mobile/modules/apple-maps-search`) as the sole search source on iOS, preserving formatted street addresses.
  - Track initial location state explicitly (`"checking" | "locating" | "ready" | "denied" | "failed"`) so authorized users transition straight from `PickerRowsSkeleton` into nearby casinos without flashing `"Near me"` or `"Searching…"`. Show `"Near me"` only after permission is confirmed not granted.
  - Render a checkmark on the currently selected casino when present in the list, plus `"Not listed"` / `"Not set"` option to clear the casino.
- [x] Unify **every** casino selection flow onto `CasinoPickerSheet` with **instant selection and no Save button**:
  - `Edit my session -> Casino` (`Play.tsx` + refactored `VenueSheet` in `RecordingForms.tsx`): remove `"Save casino"` button completely. Tapping a casino resolves via `resolveVenue` and immediately commits `edit_visit`, showing an inline `ActivityIndicator` on the tapped row while blocking dismissal (`busy`), then automatically returns to `Edit my session` on success. On error, stays open and shows `FormError` so the user can retry.
  - `StartSheet`, `PastSessionSheet`, and `You` (`Default casino`): keep instant selection + automatic return with inline resolving spinner and error preservation.
- [x] Update `apps/mobile/src/features/VenuePicker.test.tsx` and `apps/mobile/src/screens/Play.test.tsx` to cover instant selection (no Save button), error retention on failed save/resolve, and skeleton rendering during initial load/search.

## Non-goals

- Replacing `MKLocalSearch` on iOS or changing backend `/public/venues/resolve` contracts.
- Trip picker implementation (built on `SearchablePickerSheet` in 034).

## Acceptance criteria

- [ ] Opening Casino from `Edit my session`, `Start session`, `Add past session`, or `You -> Default casino` opens straight to full height with a pixel-perfect row skeleton and zero size jump.
- [ ] On iOS 26, the bottom search bar is a native iOS search bar that tracks the keyboard and displays the native clear button to the right when text is typed.
- [x] There is no `"Save casino"` button anywhere; tapping a casino saves/resolves (with inline row spinner) and immediately returns to the parent sheet.
- [x] On failed resolution or save, the sheet stays open with a clear `FormError` and allows retry.
- [x] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, and `pnpm --filter @stacks/mobile test` pass.
