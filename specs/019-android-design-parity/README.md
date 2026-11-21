---
status: complete
created: 2026-11-16
priority: high
tags:
  - mobile
  - android
  - design
created_at: 2026-11-16T17:18:15.495532200Z
updated_at: 2026-11-21T03:29:21.172306700Z
completed_at: 2026-11-21T03:29:21.172306700Z
transitions:
  - status: in-progress
    at: 2026-11-21T00:25:38.871405200Z
  - status: complete
    at: 2026-11-21T03:29:21.172306700Z
---

# Android matches its design frames

## Overview

The Claude Design canvas now has an Android twin for every iOS frame (see
`docs/design/frames.md`). The Android app still differs from them: it was built from the iOS frames
and older specs, so its chrome, sheets and Stats screens drift. This umbrella spec brings the
Android UI in line with the `And*` frames, one area per child spec, and fixes the method every
child uses to prove it.

## Design

- **Source of truth:** the `And<Name>` frames on the canvas, rendered on the `design-frames`
  branch (`android/<file>.png`, light and dark). `docs/design/frames.md` maps each frame to its
  screen and says how to reach the state.
- **Rules that hold everywhere:**
  - Tab roots (Play, Stats, Map, Crew) have no title; pushed pages show a 34px large title (#97).
  - Live play outside a live session shows only in the LiveBar, with the frames' content: game
    chip, game, "Casino · $X in", elapsed time, live dot.
  - Native components first. Where the frames draw a Material control, use the real one (`@expo/ui`
    Jetpack Compose, the native tab navigator, system menus and pickers). If the native control
    can't take the frame's look, keep the native control and record the gap in the child spec.
  - Copy, amounts and type roles come from the frame; sample data doesn't.
- **iOS stays put.** Shared components may change only when the iOS frames agree. Otherwise branch
  per platform (`*.android.tsx`) as `ActionMenu` and `PlaceTabs` already do.
- **Children:** 024 shared parts (sheets, footers, insets, pickers, dialogs) comes first, because
  the 2026-11-16 audit found them broken on every screen. Then 020 shell, Play and Crew; 021 live
  table and sheets; 022 Stats; 023 Live Updates. The audit's behaviour bugs are spec 025, outside
  this umbrella.

## Verification protocol (every child)

1. Emulator: a Pixel 10 AVD on Android 17 QPR2 (API 37.2, Play Store, 16 KB pages), default font
   and display size. `docs/design/frames.md` has the image id.
2. For each frame the child lists, reach the state, screenshot light and dark with the T3 device
   tools, and compare side by side with the reference PNG.
3. In the PR, a table per frame: reference, after screenshot, and any difference that stays with
   its reason. Images go on `pr-assets/<branch>`.
4. Update the Maestro flows a change breaks (`apps/mobile/maestro`), and run the checks CI runs.
5. Check light, dark and 1.35× font scale (`adb shell settings put system font_scale 1.35`).
6. To test offline states, stop the API or remove the port forward (`adb reverse --remove tcp:8787`).
   Airplane mode doesn't work, because `adb reverse` keeps reaching the API.

## Non-goals

- Changing the frames. A design change goes to the canvas first, then here.
- iOS work, and anything web (spec 018 retires web).

## Plan

- [x] Publish light and dark references for every indexed Android frame on `design-frames`
- [x] 024 shared parts ([PR #109](https://github.com/stephencombs/stacks/pull/109))
- [x] 020 shell, Play and Crew ([PR #114](https://github.com/stephencombs/stacks/pull/114))
- [x] 021 live table and sheets ([PR #119](https://github.com/stephencombs/stacks/pull/119))
- [x] 022 Stats ([PR #120](https://github.com/stephencombs/stacks/pull/120))
- [x] 023 Live Updates ([PR #117](https://github.com/stephencombs/stacks/pull/117))

## Test

- [x] Every `And*` frame in `docs/design/frames.md` has a matching emulator screenshot, light and
      dark, in a merged child PR, with any remaining difference explained (verified on Pixel 10 across 024, 020, 021, 022, and 023; signed-in-only Stats states in 022 are covered by component/runtime tests, and iOS verification remains deferred)
