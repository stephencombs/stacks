---
status: planned
created: 2026-11-22
priority: high
tags:
  - mobile
  - ios
  - navigation
  - design
parent: 029-ios-ui-polish
created_at: 2026-11-22T19:22:53.966545700Z
updated_at: 2026-11-22T20:50:19.313282900Z
---

# Stable tab header and toolbar across all four tabs

## Overview

Switching between Play, Stats, Map, and Crew on iOS shifts the You avatar button and top toolbar controls both vertically and horizontally, switching between empty and populated Map toggles header systems, selecting filters on Stats locks scrolling behind the Dynamic Island, and pushing from Play to All sessions misses UIKit's native iOS 26 navigation bar transition. All four tab roots and their pushed screens must share the native iOS 26 `UINavigationBar` via a declarative `<Toolbar>` primitive (modeled on `pingdotgg/t3code`'s `NativeHeaderToolbar` + `StackHeader`) so the toolbar stays rock-solid across tabs and morphs smoothly during push/pop transitions (`[Color Up] ... [You]` <-> `[<] All sessions [By month]`, `[Groups][You]` <-> `[<] Title [You]`).

## Root cause

1. **Split header systems across tab roots:**
   - **Play** (`apps/mobile/src/App.tsx`, `features/Personal.tsx`, `screens/Home.tsx`) sets `headerShown: false` and floats `<PersonalYouButton />` at `top: insets.top`, `right: Math.max(16, insets.right)`.
   - **Map** (`screens/Map.tsx`) sets `headerShown: false` and floats its top row at `top: insets.top + 8` in `PopulatedMap`, while `EmptyMap` sets `headerShown: true` (native `UINavigationBar`).
   - **Stats** (on TestFlight) and **Crew** (`screens/Crew.tsx`, `components/ui/Screen.tsx`, `features/NativeHeaderActions.ios.tsx`) render inside native `UINavigationBar` (`headerShown: true`, `headerTransparent: true`), vertically centered in the 44pt bar with UIKit's iOS 26 trailing margin. Uncommitted worktree changes moved Stats to `headerShown: false` + `topSafeArea` as an interim scroll workaround.
2. **Broken `Play -> All sessions` transition (`App.tsx`):** `History` (`All sessions`) is registered on `RootStack` (where `Tabs` has `headerShown: false`) instead of `PlayStack`. Crossing `UINavigationController` boundaries — and transitioning from a hidden navigation bar (`RNSScreenStackHeaderConfig.mm:778-786` skips `animateAlongsideTransition` when `wasHidden == YES`) — prevents UIKit from animating the shared `UINavigationBar` and its Liquid Glass items.
3. **Imperative `navigation.setOptions` races & missing `ScrollView` surface color:** `useNativeHeaderActions` imperatively rewrites `headerRight` in `useLayoutEffect` with fresh closures on every render (churning native `UIBarButtonItem`s), `personalOptions.headerRight` (`App.tsx`) omits `headerRightBackgroundVisible` on frame 1, and `PersonalScreen`/`Screen` leave `<ScrollView>` transparent (`bg-canvas` is only on the outer `<View>`), causing UIKit's iOS 26 top scroll-edge material to sample clear/near-white instead of canvas.
4. **Stats filter scroll lock (`IMG_5150`):** `PersonalScreen` set `alwaysBounceVertical={false}` and `clampedScrollOffset` read `nativeEvent.contentInset.top` (`0`) instead of UIKit's `adjustedContentInset.top` (`~106pt`). Whenever selecting a filter shrank content height, `clampedScrollOffset` called `scrollTo({ y: 0 })`, scrolling the filter chips 106pt up behind the navigation bar and Dynamic Island into `scrollEdgeEffects.top` blur and locking them there.

## Platform notes (verified against installed `react-native-screens@~4.30.1` + `@react-navigation/native-stack@7.21.0`)

- **Supported out of the box:** `unstable_headerLeftItems`, `unstable_headerRightItems` (`type: "button" | "menu" | "custom" | "spacing"` with `sharesBackground`, `hidesSharedBackground`, `identifier`, `variant: "plain" | "done" | "prominent"`, `icon`), `headerLeftBackgroundVisible`, `headerRightBackgroundVisible`, `scrollEdgeEffects`.
- **Not in stock `4.30.1` (T3 Code v5 fork-only — do not assume available):** `Stack.HeaderConfig`, `unstable_headerToolbarItems` (`Toolbar placement="bottom"`), `unstable_navigationItemStyle`, `Tabs.Screen prewarmRequest`.
- **Spacer `index` bug in stock `4.30.1` + `@react-navigation/native-stack@7.21.0`:** `useHeaderConfigProps.js:15-20` returns `type: "spacing"` items without an `index`, and `RNSScreenStackHeaderConfig.mm:945-950` defaults missing `index` to `0`, moving spacers before earlier siblings. Set `(item as { index?: number }).index = items.length` on every spacing item when collecting items.
- **Right-item ordering:** `useHeaderConfigProps.js:274` reverses `unstable_headerRightItems`, so pass items in **visual left-to-right order** in JS (e.g. `[Groups, You]` puts `Groups` to the left of `You`).

## Design & Requirements

- [ ] **Build Color Up's declarative iOS `<Toolbar>` + `<ScreenOptions>` primitive** (`apps/mobile/src/components/ui/Toolbar.ios.tsx` + Android no-op `Toolbar.tsx` + `apps/mobile/src/components/ui/ScreenOptions.tsx`, modeled on `pingdotgg/t3code`'s `NativeHeaderToolbar.tsx` and `StackHeader.tsx`):
  - Expose `<Toolbar placement="left" | "right">` with compound children: `Toolbar.Button` (`icon`, `label`, `accessibilityLabel`, `separateBackground`, `identifier`, `variant`, `disabled`, `tintColor`, `onPress`), `Toolbar.Menu` (`title`, `icon`, `accessibilityLabel`, `separateBackground`, `identifier`, `disabled`), `Toolbar.MenuAction` (`icon`, `subtitle`, `isOn`, `disabled`, `destructive`, `onPress`), `Toolbar.Custom` (`hidesSharedBackground`, `children`), and `Toolbar.Spacer` (`width`).
  - Route all `onPress` callbacks through a `committedHandlers` ref updated in `useLayoutEffect` so native `UIBarButtonItem`s always invoke the latest committed closure without re-registering native items when callbacks change.
  - Deduplicate `navigation.setOptions` calls in `<ScreenOptions>` using a structural options signature (with an explicit `optionsVersion` prop for dynamic menu/filter state) so iOS 26 bar buttons never flicker or re-fade on unrelated re-renders.
  - Clear the placement (`unstable_headerLeftItems: () => []` / `unstable_headerRightItems: () => []`) in `useLayoutEffect` unmount cleanup so switching states (e.g. `PopulatedMap -> EmptyMap`) never leaves stale items behind.
  - Apply the spacer `index` workaround (`(item as { index?: number }).index = items.length`).
- [ ] **Adopt shared `GLASS_HEADER_OPTIONS` and opaque `ScrollView` surface** (`apps/mobile/src/App.tsx`, `features/Personal.tsx`, `components/ui/Screen.tsx`):
  - Export a shared capability helper `isLiquidGlassSupported = Platform.OS === "ios" && isGlassEffectAPIAvailable()` (from `expo-glass-effect`; also reused by 036).
  - Configure `headerOptions` with `headerShown: true`, `headerTransparent: isLiquidGlassSupported`, `headerStyle: isLiquidGlassSupported ? { backgroundColor: "transparent" } : undefined`, `headerShadowVisible: false`, `headerLargeTitle: false`, `headerBackButtonDisplayMode: "minimal"`, `headerBackTitle: ""`, and `scrollEdgeEffects: isLiquidGlassSupported ? { top: "automatic", bottom: "hidden", left: "hidden", right: "hidden" } : undefined`.
  - Keep `headerShown: true` across **all four iOS tab roots** (`PlayStack.Home`, `StatsStack.Stats`, `MapStack.Map` empty & populated, `CrewStack.Crew`).
  - Put `bg-canvas` directly on `<ScrollView>` in `PersonalScreen` (when `!felt`) and `Screen` so UIKit's top scroll-edge material samples `bg-canvas` instead of a transparent near-white tint.
- [ ] **Move `History` (`All sessions`, `linking: "history/:period?"`) from `RootStack` into `PlayStack`** (`apps/mobile/src/App.tsx`, `screens/Play.tsx`):
  - Configure `PlayTab` with `linking: { initialRouteName: "Home" }` (matching `CrewTab`) so `/history`, `/history/2026-11`, and `/history/2026` deep-link to `PlayTab -> History` with `Home` underneath for back navigation.
  - Pushing `Home -> History` stays in `PlayStack`'s single `UINavigationController`, keeping the bottom tab bar and triggering UIKit's native iOS 26 `UINavigationBar` transition.
  - Update `PlayScreen`'s `<Missing />` `"All sessions"` fallback (`apps/mobile/src/screens/Play.tsx`) to navigate to `Tabs -> PlayTab -> History`.
- [ ] **Unify iOS native `UINavigationBar` items across all four tabs, `History`, and `GroupSettings`** (`features/NativeHeaderActions.ios.tsx`, `components/ui/SettingsLayout.ios.tsx`, `screens/Home.tsx`, `screens/Map.tsx`, `screens/Crew.tsx`, `screens/History.tsx`):
  - **Play root (`Home`):** Place `<PlayBrand />` in static `Home` `options` (`headerLeft: () => <PlayBrand />`, `headerLeftBackgroundVisible: false`, or `<Toolbar placement="left"><Toolbar.Custom hidesSharedBackground><PlayBrand /></Toolbar.Custom></Toolbar>`) with explicit non-zero height (`h-11 justify-center`) so the Color Up mark/wordmark sits plain/unboxed with no glass capsule and fades cleanly into `[<]` on push. Remove `<PlayBrand />` from `HomeScreen`'s scroll body.
  - **You avatar button (Play, Stats, Map, Crew, Group, Trip, GroupSettings):** Render via `<Toolbar placement="right">` with a stable `identifier="you-account"` (aligned with default stack options to avoid frame-1 flicker). On iOS 26+, prefer UIKit's native Liquid Glass platter (`hidesSharedBackground: false` on a sized avatar pressable with no nested `<ControlSurface>`/`<GlassSurface>` when signed in; native `Toolbar.Button` with `icon="person"` when signed out) so UIKit morphs the right glass capsule across transitions. _Device fallback:_ if iOS 26 adds excess horizontal padding around a custom-view platter vs a circular button, keep `You` inside `UINavigationBar` with `hidesSharedBackground: true` + `44×44` `<ControlSurface>` (still pixel-locked across all four tabs and animated by `UINavigationBar`). Keep `<ControlSurface>` on iOS < 26.
  - **Crew root (`Crew`):** Render `[Groups, You]` inside `<Toolbar placement="right">` using native `Toolbar.Button` (`label="Groups"`, `separateBackground`, `identifier="crew-groups"`) beside `You` (with `<Toolbar.Spacer width={8} />` only if needed on iOS 26 to guarantee two distinct glass capsules). Keep loading, empty, and signed-out Crew states on the same navigation bar.
  - **Map root (`Map` empty & populated):** Keep `headerShown: true` in both `EmptyMap` and `PopulatedMap`; remove `PopulatedMap`'s `headerShown: false` toggle and manual `top: insets.top + 8` overlay. In `PopulatedMap`, render the filter trigger (`view.filterLabel`, opening the existing Map view sheet) and conditional clear `×` button (`icon="xmark"`, `separateBackground`) inside `<Toolbar placement="left">`; unmount `<Toolbar placement="left">` in `EmptyMap` so cleanup clears left items cleanly.
  - **All sessions (`HistoryScreen`):** Keep `title: "All sessions"` centered in `UINavigationBar` with native minimal `[<]` Liquid Glass back button. On iOS, move `"By month"` / `"By year"` into `<Toolbar placement="right">` as a native Liquid Glass `<Toolbar.Menu>` displaying the active grouping (`"By month"` or `"By year"`) with checked `<Toolbar.MenuAction>` items, omit the duplicate in-body `<SegmentedControl>` on iOS, and suppress `PersonalScreen`'s `You` button (`headerActions={false}`) so `[You]` morphs cleanly into `[By month]` on push and back on pop. Keep `<SegmentedControl>` on Android.
- [ ] **Fix Stats filter scrolling under native `UINavigationBar` and reconcile uncommitted worktree changes:**
  - Revert the uncommitted `headerShown: false`, `topSafeArea`, `floatingTopBar`, and `<View className="h-7" />` spacer changes in `App.tsx`, `Personal.tsx`, and `Stats.tsx`; delete unused `apps/mobile/src/components/ui/scrollClamp.ts` and `scrollClamp.test.ts` (keep `manualInset` in `PersonalScreen` only for `session` live felt screens).
  - Restore `contentInsetAdjustmentBehavior="automatic"` and default `alwaysBounceVertical={true}` on non-session `PersonalScreen` and `Screen` so UIKit manages `adjustedContentInset.top` and `adjustedContentInset.bottom` natively without ever trapping scrolled content.
  - On `StatsScreen` (iOS), when a filter or group changes while scrolled down, scroll back to `-headerHeight` (from `useHeaderHeight()` in `@react-navigation/elements`) only if currently scrolled past it — never call `scrollTo({ y: 0 })`, which scrolls chips behind the navigation bar and Dynamic Island.
- [ ] Keep Android headers, `StatsParts` Android filter bar, `CrewGroupsButton`, and `History` Android `SegmentedControl` unchanged.

## Non-goals

- Live session screen header (`Play.tsx` / `Table.tsx`), covered in 031.
- iOS 26 tab bar minimize / `bottomAccessory`, covered in 036.
- Redesigning Crew pushed screens' content (`Group`, `Sessions`, `GroupSettings`), which automatically benefit from sharing `CrewStack`'s `UINavigationBar` and stable `identifier="you-account"`.

## Acceptance criteria

- [ ] Rapidly switching between Play, Stats, Map (empty and populated), and Crew on iOS 26 shows zero pixel shift (X or Y) in the You avatar button or navigation bar alignment, with no button flicker/re-fade on re-renders.
- [ ] On Play, the Color Up brand mark and wordmark sit plain/unboxed on the left of `UINavigationBar` (no glass pill) aligned with the circular Liquid Glass You avatar on the right.
- [ ] Pushing `Play -> All sessions` and `Crew -> Group / Trip / GroupSettings` (and swiping or tapping back) performs smooth native iOS 26 `UINavigationBar` transitions (`[Color Up] ... [You]` <-> `[<] All sessions [By month]`, `[Groups][You]` <-> `[<] Title [You]`) with no abrupt bar pop-in.
- [ ] Selecting or clearing any Stats filter (game, casino, period, trip, group) keeps filter chips cleanly below the navigation bar and Dynamic Island with no blur overlap and never locks scrolling.
- [ ] Deep links `/history`, `/history/2026-11`, and `/history/2026` open `PlayTab -> History` with working back navigation to `Home`.
- [ ] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, and `pnpm --filter @stacks/mobile test` pass (including new `Toolbar.ios.test.tsx` / `ScreenOptions` unit tests plus updated `Map.test.tsx`, `Stats.test.tsx`, `App.test.tsx`).
