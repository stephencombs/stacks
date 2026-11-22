---
status: planned
created: 2026-11-22
priority: medium
tags:
  - mobile
  - ios
  - design
parent: 029-ios-ui-polish
created_at: 2026-11-22T19:22:54.488159Z
updated_at: 2026-11-22T20:50:19.346038300Z
---

# Live session toolbar control dimensions match design

## Overview

On the iOS live session screen, the three top toolbar controls (`<` back button, `● LIVE 0:41:21` pill, and `⋯` actions menu) have mismatched sizes and glass tinting compared to `ios/LiveDark.png`: the `⋯` circle is noticeably oversized (~58pt) and the `LIVE` pill is taller than the 44pt back circle.

## Root cause

- `apps/mobile/src/components/ui/ActionMenu.ios.tsx` (lines 42–58) renders a SwiftUI `Menu` with `.buttonStyle(.glass)`, `.buttonBorderShape(.circle)`, and `controlSize("large")` around a `24×24` `Image`. On iOS 26, `.controlSize(.large)` pads the glass circle out to ~58pt diameter, ignoring the 44pt target of `<ControlSurface>`.
- `apps/mobile/src/features/LiveTable.tsx` (`LiveClock`, lines 75–89) uses `min-h-11` instead of fixed `h-11`, allowing vertical sizing drift against the 44pt side buttons.
- `apps/mobile/src/components/ui/Button.tsx` (`IconButton`, line 178) applies `bg-black/15 active:bg-black/25` on the outer `PressableScale` even on iOS where `<ControlSurface felt>` already renders Liquid Glass, adding a dark backdrop ring behind the glass.

## Design & Requirements

- [ ] Reference `ios/LiveDark.png` (and `ios/Live.png`, `ios/MpStarterDark.png`, `ios/MpJoinerDark.png`) on `origin/design-frames`: all three controls (`<`, `● LIVE H:MM:SS`, `⋯` or single `Edit` icon) must share an exact **44pt** height, aligned on one horizontal centerline.
- [ ] Fix `apps/mobile/src/components/ui/ActionMenu.ios.tsx`:
  - Constrain the non-`fab` circular `Menu` trigger to exact **44×44pt** diameter (remove `controlSize("large")` bloat; verify exact rendered size on iOS 26 using `.controlSize("regular")` or explicit frame/label sizing so its circle matches `ControlSurface`'s `size-11` pixel-for-pixel).
  - Preserve the `fab` (`+` on Play) size at 56×56pt and native SwiftUI `Menu` Liquid Glass presentation.
- [ ] Fix `apps/mobile/src/features/LiveTable.tsx` (`LiveClock`):
  - Lock the iOS glass pill to fixed `h-11` (`44pt`), `radius={22}`, `px-4`, `gap-2`, `items-center`, with `size-2` live dot, `type-footnote font-semibold` `LIVE`, and `type-callout font-semibold tabular-nums` elapsed time.
- [ ] Fix `apps/mobile/src/components/ui/Button.tsx` (`IconButton`):
  - Scope `bg-black/15 active:bg-black/25` to Android only (`!plain && felt && Platform.OS === "android"`), so iOS felt `IconButton` renders clean, uniform Liquid Glass matching `LiveClock` and `ActionMenu`.
- [ ] Verify both `PlayScreen` (`apps/mobile/src/screens/Play.tsx`, `VisitHeader`) and `TableScreen` (`apps/mobile/src/screens/Table.tsx`) — including multi-action `⋯` (`ActionMenu`), single-action `Edit` (`IconButton`), and 0-action spacer (`size-11`). Note: `PlayScreen` (live felt) and `TableScreen` intentionally use `headerShown: false` with a custom felt top row matching `ios/LiveDark.png`, independent of 030's tab navigation bars.

## Non-goals

- Changing Android felt header layout (`AndLiveDark.png`).
- Changing actions inside the `⋯` menu.

## Acceptance criteria

- [ ] On iOS 26 (both `PlayScreen` and `TableScreen`), `<`, `LIVE` pill, and `⋯` (or single-action `Edit`) have identical 44pt heights, centered vertically on the same horizontal axis, with uniform felt glass material matching `ios/LiveDark.png`.
- [ ] Play's floating `+` FAB (`ActionMenu fab`) remains 56×56pt and unaffected.
- [ ] Android live felt screens match existing `AndLive` frames with no visual regression.
- [ ] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, and `pnpm --filter @stacks/mobile test` pass (including `Play.test.tsx` and `Table.test.tsx`).
