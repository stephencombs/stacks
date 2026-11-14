---
status: planned
created: 2026-11-14
priority: low
tags:
  - mobile
  - ios
depends_on:
  - "008"
parent: "001"
created_at: 2026-11-14T20:15:32.727217584Z
updated_at: 2026-11-14T20:21:32.073282694Z
---

# iOS Live Activity

## Overview

While a session is live on iOS, show it on the lock screen and in the Dynamic Island, so a player can glance at their money and the clock without opening the app. Version one is display-only; its buttons open the app. Android gets nothing for now.

## Design

- **Lock screen:** game, casino, your buy-in total and the elapsed time. Buttons (+ $100, + $200, Cash out) open the app on the live session; Cash out opens straight onto the cash-out keypad.
- **Dynamic Island:** compact shows the elapsed time; expanded shows the lock-screen content.
- **Finished:** the activity keeps the result for a while: result, duration, in, out, hourly, and **See session**.
- Shows only your own money, even at a shared table.
- Updates from the app when the session changes; no push server in version one. The clock runs on its own as a system timer, so it stays right while the app is closed.
- Needs a native module or config plugin for ActivityKit (follow `AGENTS.md`'s Expo rules; no hand edits to `ios/`). Start with a spike to confirm what the current Expo SDK supports.
- Later, if it proves worth it: rebuying from the lock screen with undo (writes to the device store while the app isn't running).
- Designs: `LiveActivity`, `LockCashOut`, `LockDone`, `IslandCompact`, `IslandExpanded` on the 003 · Live session page. `LockRebuy` and the Island's actions are later.

## Plan

- [ ] Spike: Live Activity from Expo on the current SDK
- [ ] Start, update and end the activity with the session
- [ ] Buttons deep-link into the live session and the cash-out keypad
- [ ] Finished state

## Test

- [ ] Starting, rebuying and cashing out in the app update the activity
- [ ] The activity ends or shows the result after cash out, and survives the app being closed
