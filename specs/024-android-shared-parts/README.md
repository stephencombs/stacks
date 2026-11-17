---
status: in-progress
created: 2026-11-16
priority: critical
tags:
  - mobile
  - android
  - design
parent: "019"
created_at: 2026-11-16T21:53:43.036558900Z
updated_at: 2026-11-17T03:16:03.088960300Z
transitions:
  - status: in-progress
    at: 2026-11-17T03:16:03.088960300Z
---

# Android sheets, insets and native controls

## Overview

The Android audit (2026-11-16, four reviewers on the Pixel 10 emulator) found that the parts every
screen shares are broken on Android: sheets, bottom bars, the keypad, tab-bar insets, pickers and
dialogs. Each is one component, so one fix repairs many screens. This comes before 020–022, whose
frame work sits on top of these parts. Parent 019 has the verification protocol.

## Design

- **Sheets** (`components/ui/Sheet.tsx`, the Android `Modal` path): the sheet stays below the status
  bar; the close button is tappable (today only system Back closes a sheet); a sheet is as tall as
  its content up to the screen, not full-screen. Short sheets (member actions, Leave group, the
  "+1 live" picker) stay short. The header follows 021's Android sheet header.
- **Bottom bars** (Finished, a closed table, a session page, the felt's Rebuy / Cash out dock): a
  pinned footer has the canvas background, as AndFinished draws it, and a hairline top edge, so content and the LiveBar never show
  through it. Scrolled content stops at the status bar instead of drawing under it.
- **Keypad** (`features/AmountKeypad.tsx` in Cash out and Cash out a player): the whole keypad stays
  above the footer and the navigation bar, at 1.0× and 1.35× font scale.
- **Tab-bar inset:** anything at the bottom of a tab screen clears the tab bar, from
  `useTabBarHeight`, not only the system inset. Fix:
  - `Landing.tsx:323` and `:363`, the signed-out Crew intro: Continue, Get started and Record
    without an account.
  - Stats' last row and **See all**.
  - The trip FAB.
  - The LiveBar over a list's last row. The LiveBar doesn't show on Crew (020).
- **Pickers** (`FieldChoice.android.tsx`): Game, Trip, Paid by/to, Player, Currency and Appearance
  are full-width Material exposed dropdowns with a trailing arrow that open on the first tap.
- **Theme:** no Android system teal anywhere. Switches, text handles and selection, dialog buttons
  and segmented controls take the app tokens, set through `app.config.ts` and config plugins.
- **Confirmations** (`confirmAction.ts`): Delete session, Delete trip, Leave group and Delete my
  visit are Material 3 alert dialogs (021's `AndDeleteSession`): sentence-case text buttons, the
  destructive one in loss red. Revoke an invite is red too.
- **Large text:** at 1.35× nothing truncates that holds an action ("Back at the table",
  "Undo cash-out"), sheet rows don't hide behind the footer, and Finished's action row stacks
  cleanly.
- **Smaller chrome:**
  - Pushed group and trip pages don't show a strip of the previous screen on the left.
  - The felt sets light status-bar icons in dark mode.
  - The trip FAB keeps its intrinsic width.
  - Syncing doesn't shift the live screen.
  - The account-sync banner has no empty gap.
  - The second LiveBar clears the REBUY label.
  - A table's accessibility label counts the players who are actually seated.

## Non-goals

- The frame-specific look of each screen (020–022). This spec makes the shared parts work.
- iOS. Where a fix lands in a shared file, check iOS doesn't change.

## Plan

- [x] Sheet: position, tappable close, height to content
- [x] Footer surface and status-bar edge
- [x] Keypad fits above the footer at 1.0× and 1.35×
- [x] Tab-bar inset on Landing, Stats, trip and LiveBar
- [x] Material exposed dropdowns for pickers
- [x] App tokens replace the system teal
- [x] Material alert dialogs for confirmations
- [x] Large-text fixes
- [x] Smaller chrome items

## Test

- [x] On the Pixel 10 emulator, light and dark, at 1.0× and 1.35×: every sheet listed in the audit
      opens below the status bar and closes from its × button
- [x] A new signed-out user gets through the Crew intro without leaving it
- [x] No teal (`#008577`) in any screenshot
- [ ] iOS screenshots of the touched shared screens are unchanged
