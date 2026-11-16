---
status: planned
created: 2026-11-16
priority: low
tags:
  - mobile
  - android
depends_on:
  - "008"
parent: "019"
created_at: 2026-11-16T17:18:18.101034500Z
updated_at: 2026-11-16T17:18:18.101034500Z
---

# Android Live Updates

## Overview

While a session is live on Android, show it as a Live Update: a promoted ongoing notification on
the lock screen and at the top of the shade, and a status-bar chip in other apps. It's Android's
counterpart to spec 014's iOS Live Activity, and version one matches 014's scope.

## Frames

Page 003 · Live session: `AndLiveUpdate`, `AndStatusChip`, `AndShadeUpdate`, `AndLockCashOut`,
`AndLockDone` (version one), `AndLockRebuy` (later), light and dark.

## Design

- **Live Update** (Android 16+): `setRequestPromotedOngoing`, ongoing, a content title, no custom
  `RemoteViews`, not colorized, on a channel above `IMPORTANCE_MIN`, and the
  `POST_PROMOTED_NOTIFICATIONS` permission. Below Android 16 it posts as an ordinary ongoing
  notification. Guidance: <https://developer.android.com/develop/ui/compose/notifications/live-update>.
- **Content:** game, casino, your buy-in total, elapsed time as a chronometer (`setWhen` with
  `setUsesChronometer`), and up to three actions: **+ $100**, **+ $200**, **Cash out**. In version
  one each action opens the app on the live session; **Cash out** opens the cash-out keypad
  (`AndLockCashOut`).
- **Status-bar chip:** elapsed time through `setShortCriticalText` (the chip shows at most 7
  characters in 96dp, so "1:28", not "1:28:10").
- **Finished:** the Live Update ends, because Google says past activities don't use one. Post an
  ordinary dismissible notification with the result, duration, in, out, hourly, and **See
  session** / **Back at the table** (`AndLockDone`).
- Your own money only, even at a shared table. Updates from the app when the session changes; no
  push server in version one.
- Needs a native module or config plugin (follow AGENTS.md's Expo rules; no hand edits to
  `android/`). Start with a spike on what the current Expo SDK and `expo-notifications` support.
- Later: rebuy from the notification with undo (`AndLockRebuy`), which writes to the device store
  while the app isn't in front.

## Non-goals

- iOS (spec 014); a push server; widgets.

## Plan

- [ ] Spike: promoted notifications from the Expo app
- [ ] Post, update and end the Live Update with the session
- [ ] Actions that open the app, Cash out onto the keypad
- [ ] Finished notification
- [ ] Permission prompt and the pre-16 fallback

## Test

- [ ] Each frame above matches on the emulator, light and dark (019's protocol), on an Android 16+
      image
- [ ] Ending, deleting or undoing a session removes or updates the notification
