---
status: complete
created: 2026-11-16
priority: low
tags:
  - mobile
  - android
depends_on:
  - "008"
parent: "019"
created_at: 2026-11-16T17:18:18.101034500Z
updated_at: 2026-11-21T01:05:25.986938100Z
completed_at: 2026-11-21T01:05:25.986938100Z
transitions:
  - status: in-progress
    at: 2026-11-20T23:05:43.314468300Z
  - status: complete
    at: 2026-11-21T01:05:25.986938100Z
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
- **Status-bar chip:** Android's chronometer keeps the elapsed time moving in other apps. A static
  short critical label overrides that timer, so leave it unset.
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

- [x] Spike: promoted notifications from the Expo app
- [x] Post, update and end the Live Update with the session
- [x] Actions that open the app, Cash out onto the keypad
- [x] Finished notification
- [x] Permission prompt and the pre-16 fallback

## Test

- [x] Compare the lock-screen Live Update, shade, Cash out keypad and finished notification with
      the light and dark frames on a Pixel 10 (Android 17)
- [x] Capture the status chip with its elapsed time in both themes
- [x] Ending, deleting or undoing a session removes or updates the notification
- [x] Verify the ordinary notification fallback on Android 15

Android supplies the notification layout and action styling. The finished notification starts
collapsed and reveals the full breakdown and actions when expanded. On the Pixel 10, Cash out
from the lock screen opened the keypad, an in-app rebuy updated the buy-in, undo restored the Live
Update, and deleting the session cleared it. The status chip kept counting while Settings was
open in both themes. Privacy mode hid the finished amounts without clearing the notification.
On Android 15, the ordinary ongoing notification showed a running timer and opened the Cash
out keypad. Finishing replaced it with the result notification.

The recording bridge has automated coverage for replacing a live notification with the finished
summary, hiding its amounts when privacy mode changes, and clearing it when the session is deleted.
