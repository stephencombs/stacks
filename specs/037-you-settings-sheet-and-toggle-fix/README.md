---
status: in-progress
created: 2026-11-22
priority: high
tags:
  - mobile
  - ios
  - sheets
  - settings
parent: 029-ios-ui-polish
created_at: 2026-11-22T19:22:57.548962400Z
updated_at: 2026-11-22T22:01:47.282471900Z
transitions:
  - status: in-progress
    at: 2026-11-22T22:01:47.282471900Z
---

# Fix You settings sheet layout and iOS portaled-sheet double-tap toggle bug

## Overview

The You settings sheet has broken alignment, cramped spacing, inconsistent control sizing/colors, and double-card nesting; worse, every toggle (`Show cents`, `Privacy mode`, and switches inside other iOS sheets) requires two taps to visually flip state.

## Root cause

### 1. Double-tap toggle bug across all portaled iOS sheets

- `PortaledSheet` (`apps/mobile/src/components/ui/Sheet.ios.tsx:138-174`) calls `store.claim({ ..., children })` inside `useLayoutEffect`, and `SheetPortal` (`Sheet.ios.tsx:237-247`) copies `slot` into `useState(presentation)` during render.
- When a controlled React Native `<Switch>` mounted inside `SheetPortal` is tapped, `Switch.js:202-228` invokes `onValueChange(next)` (updating `YouSettings`) and `setNative({ value: next })` (re-rendering `Switch` inside sibling `SheetPortal`).
- Because `PortaledSheet` has not yet run its `useLayoutEffect`, `Switch` re-renders with `native.value === next` and stale `props.value === old`, causing `Switch`'s `useLayoutEffect` to dispatch the Fabric native command `SwitchCommands.setValue(old)`.
- That imperative command snaps native `UISwitch.on` back to `old` while Fabric commits `_props.value = next`. On the second tap, `UISwitch.on` flips to `next` and `RCTSwitchComponentView.onChange:` hits `if (props.value == sender.on) return;`, finally matching visually.
- This affects every `<Switch>` inside any portaled iOS `Sheet` (`You.tsx`, `StartSheet`, `PastSessionSheet`, `GameSheet`).

### 2. Misaligned, cramped You sheet layout

- Mixed section heading styles (`You.tsx:138` plain text vs `SettingsGroup`/`SectionHeading` vs `Choice`/`FieldLabel`, plus negative `-mt-3` footer spacing on line 259).
- `SettingsRow` (`apps/mobile/src/components/ui/Surface.tsx:497`) sets `py-1` (4px!) when `compact={ios}`, cramping two-line toggle rows (`Show cents`, `Privacy mode`) right against hairline dividers.
- `Default game` uses `<Choice inline>` (rendering bright white `"Not set ↕"` at 44px+ height), clashing with `Default casino`'s muted gray `"Not set >"` in color, height, and right-edge alignment.
- `Account` (`You.tsx:264-269`) nests `<SignedInCard>` (`<Card>`) inside `<SettingsGroup>` (`<Surface>`), violating the no-Surface-inside-Surface rule, and stuffs a full-width pill `Sign out` button into the bottom of that card instead of a separate destructive section.
- `Appearance` renders a 48px-tall full-bleed segmented control with mismatched spacing between grouped sections.

## Design & Requirements

- [x] **Fix the portaled-sheet sync lag in `apps/mobile/src/components/ui/Sheet.ios.tsx`:**
  - Ensure updates to an already-mounted `PortaledSheet` propagate synchronously to `SheetPortal`: retain snapshot state only while a closing sheet is animating out, and while `open === true` render live `children` directly (or via a synchronous ref-backed store) without delaying `children` updates through `useLayoutEffect` + `useState`. (Matches `pingdotgg/t3code`'s `Sheet.tsx`, which hosts RN `Switch` inside a native `FormSheet` without a state-delayed portal copy. _Coordination note: 032 also edits `NativeFormSheet` detents in `Sheet.ios.tsx`; keep this fix scoped to `PortaledSheet`/`SheetPortal`._)
  - Add a regression test in `apps/mobile/src/components/ui/Sheet.ios.test.tsx` verifying that tapping a controlled `<Switch>` inside `<SheetHost><Sheet>` updates the `Switch`'s `value` prop on the very first commit with zero stale-prop intermediate render.
- [x] **Rebuild the iOS You settings sheet (`apps/mobile/src/features/You.tsx` / `You.ios.tsx`) with native HIG grouped form alignment, spacing, and sizing** (following `docs/design/mobile-redesign.md#menus-and-sheets` and `SettingsLayout.ios.tsx`):
  - Use a `large` sheet on iOS (since You holds six settings sections) and evaluate rendering the iOS body with native `@expo/ui/swift-ui` `Form` / `Section` + `Toggle` + `Picker` + `RNHostView` (for `UserAvatar`) inside a `scrollable={false}` `Sheet` mode — OR if kept in RN cards for cross-sheet consistency, strictly unify every section header, footer, row height, vertical padding (`py-3`, `min-h-12` single-line, `min-h-14` two-line), icon treatment, and trailing control alignment. Prefer native SwiftUI `Form` / `Toggle` on iOS per `expo-ui` and `mobile-redesign.md` ("Settings use native grouped form sections on iOS").
  - Align `Default game` and `Default casino` cleanly: consistent row height, matching muted trailing value color, and aligned trailing indicators (`↕` menu picker and `>` disclosure chevron).
  - Fix `Show cents` and `Privacy mode` toggles: generous vertical breathing room around title + subtitle, crisp vertical centering of the native switch, and guaranteed **single-tap** toggling on first press.
  - Proportion `Appearance` (`System | Light | Dark`) properly within its section (standard iOS segmented control height/padding, matching section header rhythm).
  - Place `Export sessions (CSV)` with clean subtitle and section footer (no `-mt-3` hack).
  - Fix `Account`: no `Card`-inside-`Surface` nesting; put `Sign out` in its own separate destructive section/row (`text-loss` / SwiftUI `role="destructive"`), not a pill submit button jammed inside the profile card.
  - Ensure `Default casino` still seamlessly opens `CasinoPickerSheet` (compatible with 033).
- [x] Clean up `SettingsRow` (`apps/mobile/src/components/ui/Surface.tsx`) so all remaining RN usages (`Group.tsx`, Android `You.tsx`) drop the cramped `py-1` compact padding and maintain clean `py-3` spacing and alignment.
- [ ] Verify single-tap toggling on every other sheet switch on iOS (`StartSheet`, `PastSessionSheet`, `GameSheet`) as well.

## Non-goals

- Changing preference persistence keys (`expo-secure-store` in `lib/preferences.ts`) or CSV export format.
- Redesigning `GroupSettings` (`SettingsLayout.ios.tsx`) beyond any shared `SettingsRow` cleanup.

## Acceptance criteria

- [ ] Every toggle in the You sheet (`Show cents`, `Privacy mode`) and in `StartSheet`, `PastSessionSheet`, and `GameSheet` flips smoothly and reliably on a **single tap** (both off->on and on->off).
- [ ] All six sections of the You sheet (Your sessions, Recording defaults, Display, Appearance, Export, Account + separate destructive Sign out) have uniform horizontal margins, section header/footer spacing, row padding, icon sizing, and trailing control alignment in both light and dark mode.
- [ ] Android You sheet remains clean and regression-free.
- [x] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, and `pnpm --filter @stacks/mobile test` pass (including the new portaled-`Switch` regression test in `Sheet.ios.test.tsx`).
