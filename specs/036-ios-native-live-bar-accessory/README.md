---
status: in-progress
created: 2026-11-22
priority: high
tags:
  - mobile
  - ios
  - navigation
  - live
depends_on:
  - 030-tab-header-stability
  - 035-live-bar-single-line-marquee
parent: 029-ios-ui-polish
created_at: 2026-11-22T19:22:57.021353400Z
updated_at: 2026-11-22T22:23:46.865616300Z
transitions:
  - status: in-progress
    at: 2026-11-22T22:23:46.865616300Z
---

# iOS 26 native LiveBar tab accessory and scroll-to-minimize

## Overview

On iOS 26, the LiveBar currently floats as a manually positioned React Native `<GlassSurface>` overlay above the tab bar and never coordinates with tab bar minimization. Instead, it should behave like iOS 26's native Now Playing accessory (`UITabBarController.bottomAccessory` + `tabBarMinimizeBehavior = .onScrollDown`): sitting above the full tab bar at rest, collapsing inline beside a circular active-tab button when scrolling down, and expanding back to the full tab bar when scrolling back up or tapping that left tab button.

## Verified native platform support

Already installed in `apps/mobile/package.json` — no new native dependencies required:

- `@react-navigation/bottom-tabs/unstable` (`7.21.0`, `NativeBottomTabView.native.js:195-225`) exposes both `tabBarMinimizeBehavior: "onScrollDown"` and `bottomAccessory: ({ placement: "regular" | "inline" }) => ReactNode`.
- `react-native-screens` (`~4.30.1`, `TabsHost.ios.tsx:54-69`, `RNSTabsHostComponentView.mm:450-458`, `RNSTabsBottomAccessoryHelper.mm`) implements native `UITabAccessory` with automatic `regular` / `inline` environment switching, animated show/hide when `bottomAccessory` toggles between defined and `undefined`, and automatic primary `UIScrollView` discovery across nested `NativeStack`s.

## Design & Requirements

- [x] Enable `tabBarMinimizeBehavior: "onScrollDown"` in `apps/mobile/src/features/PlaceTabs.ios.tsx` (`placeTabsConfig`).
- [x] Wire reactive `bottomAccessory` on iOS 26+ (reusing 030's `isLiquidGlassSupported` capability check backed by `isGlassEffectAPIAvailable()` / iOS 26+ check) at the `Tabs` navigator level (`apps/mobile/src/App.tsx`, `features/PlaceTabs.ios.tsx`, `features/LiveBar.tsx`):
  - **Only attach `bottomAccessory` when a live session exists** (`bottomAccessory: hasLive ? renderLiveAccessory : undefined`). Passing a function that returns `null` still mounts an empty native `UITabAccessory` glass capsule on iOS 26, so toggling to `undefined` is required when no session is live.
  - **Do NOT nest `<GlassSurface>` inside `bottomAccessory`:** `UITabAccessory` provides the native Liquid Glass capsule and interactive morphing. Render a clean, transparent pressable row filling the accessory container for both placements:
    - `placement === "regular"`: game chip (`size-8`), single-line title + single-line `MarqueeText` venue & suffix (from 035), tabular elapsed clock, and ringed green live dot, matching the full-width bar above the tab bar.
    - `placement === "inline"`: compact padding and spacing (`gap-2 px-3`) tuned for the narrower capsule beside the circular collapsed tab icon button on the left, keeping chip, title, marquee subtitle, elapsed clock, and live dot crisp without clipping or wrapping.
  - **Shared picker state outside dual render:** Because `react-native-screens` renders `bottomAccessory("regular")` and `bottomAccessory("inline")` simultaneously, hoist the multi-session picker `Sheet` state (`picking`) into a shared provider/host in `TabsLayout` (above the two accessory instances) so tapping `"+N more"` opens exactly one sheet.
  - **Navigation from accessory:** Tapping the accessory pushes `"Play"` (`visitId`) or `"Table"` (`tableId`) onto `RootStack` cleanly from any tab.
- [x] Remove duplicate manual LiveBar rendering inside `Tabs` on iOS 26+:
  - Expose a `HasNativeLiveAccessory` context (true inside `TabsLayout` on iOS 26+) so `PersonalLiveBar` and `LiveBar` inside tab screens (`PersonalScreen`, `Screen`, `MapScreen`, `SettingsLayout.ios.tsx`) skip rendering the old manual `<Pinned>` overlay when the native `UITabAccessory` owns it.
  - Keep `<Pinned>` LiveBar intact for Android, iOS < 26, and non-tab pushed screens (such as the second live session bar in `PlayScreen`'s / `TableScreen`'s `dock`).
- [x] Coordinate bottom clearance, scroll views, FAB, and Map cards on iOS 26+:
  - Rely on 030's unified `contentInsetAdjustmentBehavior="automatic"` + default `alwaysBounceVertical={true}` on `Play`, `Stats`, and `Crew`, and ensure each scrolling tab root exposes its vertical `ScrollView` as the first scrollable descendant so `RNSTabBarController.resolveCurrentContentScrollView` hooks into it for smooth scroll-to-minimize, scroll-up-to-expand, and automatic bottom inset coordination.
  - Update `apps/mobile/src/components/ui/tabBar.ts` (`useScreenFoot` / `screenFoot`), `Home.tsx` (`+` FAB), and `Map.tsx` (`bottomDock` for venue detail sheet and summary card) to account for the native `bottomAccessory` height when a session is live so neither the `+` FAB, Map cards, nor the last scrolled row collides with the accessory or tab bar.
  - Verify `tabBar.test.ts` and add tests for the native-accessory foot-clearance math and dual-placement accessory rendering.

## Non-goals

- Changing Android's Material navigation bar or Android's floating solid LiveBar.
- Custom JS scroll-driven tab bar animations (all collapsing/expanding motion must come from native iOS 26 UIKit).

## Acceptance criteria

- [ ] On iOS 26 with an active live session:
  - At the top of a tab, the full 4-tab Liquid Glass bar sits at the bottom with the LiveBar accessory directly above it.
  - Scrolling down smoothly minimizes the tab bar into a single circular active-tab icon button on the left with the LiveBar morphing inline to its right.
  - Scrolling back toward the top OR tapping the left circular tab button smoothly expands the full tab bar and moves the LiveBar back above it.
- [ ] With no live session active, no empty glass accessory pill appears above the tab bar; starting or finishing a session animates the accessory in/out cleanly.
- [ ] Tapping the accessory in either `regular` or `inline` state opens the live session (or opens a single multi-session picker sheet when multiple sessions are live).
- [ ] Play's `+` FAB, Map's summary/venue sheets, and the last rows of Play/Stats/Crew clear the tab bar and accessory properly.
- [ ] Android and iOS < 26 keep their existing LiveBar behavior with zero regressions.
- [x] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, and `pnpm --filter @stacks/mobile test` pass.
