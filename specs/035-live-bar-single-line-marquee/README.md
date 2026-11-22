---
status: in-progress
created: 2026-11-22
priority: medium
tags:
  - mobile
  - live
  - ux
parent: 029-ios-ui-polish
created_at: 2026-11-22T19:22:56.521504500Z
updated_at: 2026-11-22T22:00:59.695274300Z
transitions:
  - status: in-progress
    at: 2026-11-22T22:00:59.695274300Z
---

# LiveBar single-line location marquee

## Overview

Long casino names in `LiveBar` (e.g., `"The Palazzo at The Venetian · $2,000 in"`) currently wrap onto two lines, bloating the bar's height and leaving dangling fragments like `"in"` on the second line. Location names in LiveBar must stay on one line and gently scroll back and forth when they overflow so users can still read the full casino name.

## Root cause

- `apps/mobile/src/features/LiveBar.tsx` (lines 58–63, 71–73, 263–267) concatenates `venue.name` and the buy-in/playing suffix into one `detail` string and renders `<Text numberOfLines={2}>`.

## Design & Requirements

- [x] Create a lightweight, reusable **`MarqueeText`** component (`apps/mobile/src/components/ui/MarqueeText.tsx`) using React Native's `Animated` with `useNativeDriver: true` (matching `docs/design/foundations.md#motion`: no new animation library, animate `transform` only):
  - Restricts text strictly to a single line (`numberOfLines={1}`) inside an `overflow-hidden` viewport.
  - Accurately measures both the available container width (`onLayout`) and the unconstrained intrinsic single-line text width — render the text inside a non-interactive horizontal `ScrollView` (`scrollEnabled={false}`, `showsHorizontalScrollIndicator={false}`) and read `onContentSizeChange((w) => ...)` (plain `<Text numberOfLines={1}>` inside a flex parent clamps `onLayout.width` to the container width).
  - When `textWidth <= containerWidth`, renders completely static with zero timers or animations running.
  - When `textWidth > containerWidth`, runs a calm ping-pong cycle: pause at start (~2.5s) -> smooth linear scroll (`Easing.linear`, ~32–36 pt/s) by `-(textWidth - containerWidth)` to reveal the end -> pause at end (~1.5s) -> smooth linear scroll back to `0` -> repeat.
  - Respects `useReducedMotion()` (`apps/mobile/src/components/ui/motion.ts`): under Reduce Motion, stays static with `numberOfLines={1}` and `ellipsizeMode="tail"`. Keep the parent `LiveBar` pressable's `accessibilityLabel` reading the full untruncated venue + amount string without re-announcing on marquee loops.
  - Cleanly stops animations on unmount, text change, or layout width change (essential when LiveBar switches between full-width `regular` and narrower `inline` widths in 036).
- [x] Update `apps/mobile/src/features/LiveBar.tsx`:
  - Split `LivePlace` subtitle into structured fields (`venueName?: string` and `suffix?: string`, e.g., `"$2,000 in"` or `"3 playing"`), rendering `<MarqueeText>` (`min-w-0 shrink`) for the venue name beside a static `shrink-0` suffix (`" · $2,000 in"`) so the buy-in/status amount is always visible without waiting for a marquee cycle.
  - Keep both the title (`numberOfLines={1}`) and the subtitle row strictly single-line (`min-h-14` / fixed pill height) across all LiveBar states (single live visit, open table, multi-live `+N more`, and legacy `Seat` bar).
- [x] Add pure logic / component tests (`apps/mobile/src/components/ui/MarqueeText.test.tsx`) verifying: no animation when text fits, overflow calculation & animation cycle when overflowing, static fallback under reduced motion, and reset when text or container width changes.

## Non-goals

- Adding marquees to general session lists or history rows (this is specifically for the compact LiveBar).
- Native iOS 26 tab bar accessory integration (covered in 036, which consumes this single-line LiveBar).

## Acceptance criteria

- [ ] A live session at a long venue name (e.g. `"The Palazzo at The Venetian"`) stays strictly on one subtitle line in LiveBar with zero vertical height increase, keeping `"· $2,000 in"` continuously visible while the venue name periodically scrolls back and forth to reveal the full name.
- [ ] Short venue names (e.g. `"Aria"`, `"Wynn"`) stay completely still with no animation.
- [ ] Enabling Reduce Motion disables marquee movement and truncates cleanly with an ellipsis.
- [ ] Works identically on iOS and Android, and adapts smoothly when LiveBar's width changes.
- [x] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, and `pnpm --filter @stacks/mobile test` pass.
