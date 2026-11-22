---
status: planned
created: 2026-11-22
priority: high
tags:
  - mobile
  - ios
  - design
created_at: 2026-11-22T19:22:38.422041100Z
updated_at: 2026-11-22T20:50:19.279313700Z
---

# iOS UI polish and native chrome

## Overview

TestFlight testing on iOS 26 (following PR #131, baseline commit `6f2d780`) surfaced eight UI, layout, and native-chrome issues across the tab shell, live session header, keypad sheets, searchable pickers, LiveBar, and You settings sheet. This umbrella spec breaks the work into focused, independently shippable child specs with clear dependencies and one shared verification standard.

## Shared context for implementing agents

- **Read first:** `AGENTS.md`, `DESIGN.md`, `docs/internals/navigation.md`, `docs/design/foundations.md`, `docs/design/mobile-redesign.md`, and the `expo-overview` skill plus the relevant leaf Expo skill (`expo-ui`, `expo-native-ui`, `expo-animation`). Note: Color Up uses React Navigation native-stack (`apps/mobile/src/App.tsx`), not Expo Router.
- **Installed native stack (`apps/mobile/package.json`):** `expo` SDK 58, `react-native` `0.88.1`, stock `react-native-screens` `~4.30.1` (NOT T3 Code's custom v5 fork), `@react-navigation/native-stack` `7.21.0`, `@react-navigation/bottom-tabs/unstable` `7.21.0`, `@expo/ui`, `expo-glass-effect`, `uniwind`.
- **Design frames:** Approved reference PNGs live on the `origin/design-frames` branch (inspect with `git show origin/design-frames:ios/<Frame>.png`, e.g. `MainDark.png`, `StatsDark.png`, `MapTabDark.png`, `CrewFeedDark.png`, `LiveDark.png`, `RebuyDark.png`, `CashOutDark.png`).
- **Execution order & file overlap:**
  - `030` -> `036` and `035` -> `036` (`036` depends on both `030` and `035`).
  - `033` -> `034` (`034` builds `TripPickerSheet` on `033`'s `SearchablePickerSheet`).
  - `031`, `032`, `037` have no hard dependencies, **but `032` and `037` both edit `apps/mobile/src/components/ui/Sheet.ios.tsx`** (`032` stabilizes `NativeFormSheet` detents; `037` fixes `PortaledSheet`/`SheetPortal` sync lag) — sequence or rebase cleanly.
  - Note: the branch may carry 6 uncommitted interim Stats-scroll files (`App.tsx`, `Screen.tsx`, `Personal.tsx`, `Stats.tsx`, `scrollClamp.ts`, `scrollClamp.test.ts`); `030` owns reconciling/reverting that workaround.

## Decomposition

- **030 — Native tab headers and iOS 26 bar transitions:** Build a declarative `<Toolbar placement="left" | "right">` + `<ScreenOptions>` primitive (modeled on `pingdotgg/t3code`'s `NativeHeaderToolbar` + `StackHeader`) and unify Play, Stats, Map (empty & populated), Crew, and pushed `All sessions` (`History` moved into `PlayStack`) onto native iOS 26 `UINavigationBar` so the You avatar never shifts, push/pop transitions morph cleanly, and Stats filter scrolling works natively.
- **031 — Live session toolbar dimensions:** Lock `<`, `LIVE` clock pill, and `⋯` menu trigger on `Play` and `Table` to exact 44pt height matching `ios/LiveDark.png`, removing SwiftUI `controlSize("large")` bloat and double-tinted felt backgrounds.
- **032 — Stable sheet sizing while typing:** Reserve space for dynamic previews and errors in Rebuy, Edit buy-in, Cash out, Start session, Add past session, and correction sheets, and stop `Sheet.ios.tsx` from re-detenting on minor height changes while typing.
- **033 — Native bottom-search casino selector:** Unify every casino entry point (including `Edit my session -> Casino`) onto a full-height reusable `SearchablePickerSheet` with a native iOS 26 bottom search bar (native clear button to the right when typed), instant selection with no Save button, and a pixel-perfect skeleton loader.
- **034 — Table trip field and searchable picker** _(depends on 033)_: Move `Trip` into the grouped card in `Edit my session` (and `Start session`) as a standard field row opening a full-height searchable `TripPickerSheet` built on `SearchablePickerSheet`.
- **035 — LiveBar single-line marquee:** Keep location names in LiveBar on a single line and gently scroll overflowing names back and forth (respecting Reduce Motion) while keeping the buy-in suffix readable.
- **036 — iOS 26 native LiveBar tab accessory and scroll-to-minimize** _(depends on 030, 035)_: Move the tab-level iOS 26 LiveBar into `UITabBarController.bottomAccessory` with `tabBarMinimizeBehavior: "onScrollDown"`, collapsing cleanly beside the circular tab button when scrolling down and expanding on scroll-up or tap.
- **037 — You settings sheet layout and double-tap toggle fix:** Fix the `Sheet.ios.tsx` portaling commit-lag bug that forces double taps on controlled `Switch`es across all iOS sheets, and rebuild the You settings sheet with consistent HIG alignment, spacing, sizing, and native grouped form sections.

## Shared verification protocol (every child)

1. Verify on an iOS 26 simulator or TestFlight build in both light and dark appearance, plus large Dynamic Type and Reduce Motion where applicable.
2. Confirm Android experiences zero visual or behavioral regressions (shared components must preserve Android frames from spec 019).
3. Run scoped CI checks before merge: `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, and `pnpm test`.
4. Attach before/after screenshots hosted on a `pr-assets/<branch>` orphan branch in each UI PR.

## Non-goals

- Changing ledger math, contracts, or server API endpoints (all required APIs already exist on `main`).
- Android-specific redesigns (Android parity landed in 019–025).

## Plan

- [ ] 030 Stable native tab headers and iOS 26 bar transitions
- [ ] 031 Live session toolbar control dimensions match design
- [ ] 032 Prevent amount and form sheets from shifting size while typing
- [ ] 033 Full-height casino selector with native bottom search bar, instant selection, and pixel-perfect skeleton
- [ ] 034 Table trip field row and searchable trip picker sheet
- [ ] 035 LiveBar single-line location marquee
- [ ] 036 iOS 26 native LiveBar tab accessory and scroll-to-minimize
- [ ] 037 Fix You settings sheet layout and iOS portaled-sheet double-tap toggle bug

## Acceptance criteria

- [ ] All eight child specs (030–037) are complete, verified on iOS 26, and merged without Android regressions
