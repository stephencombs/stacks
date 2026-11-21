---
status: complete
created: 2026-11-16
priority: high
tags:
  - mobile
  - android
  - design
parent: "019"
created_at: 2026-11-16T17:18:16.781260900Z
updated_at: 2026-11-21T03:14:46.513639Z
completed_at: 2026-11-20T21:50:11.841254200Z
transitions:
  - status: complete
    at: 2026-11-20T21:50:11.841254200Z
  - status: in-progress
    at: 2026-11-21T00:25:39.356552800Z
  - status: complete
    at: 2026-11-21T03:14:46.513639Z
---

# Android live table and its sheets match the frames

## Overview

The live session felt, its sheets and menus, the shared-table states and Finished on Android,
against their frames. Parent 019 has the method and global rules.

## Frames

Page 003 · Live session: `AndLive`, `AndMenu`, `AndRebuy`, `AndLiveEdit`, `AndDeleteSession`,
`AndBuyIn`, `AndCashOut`, `AndFinished`, `AndMpStarter`, `AndMpStarterMenu`, `AndMpJoiner`,
`AndMpJoinerEdit`, `AndMpRecorder`, `AndMpAddPlayer`, `AndMpRebuyPriya`, `AndMpCashOutPriya`,
`AndMpStarterOut`, light and dark.

## Design

- **Felt app bar** (`screens/Play.tsx`): back arrow, the LIVE pill with the clock, then one action:
  ⋮ (starter), a pencil (joiner), or person-add (recorder, not playing).
- **⋮ menu**: the system menu (`ActionMenu.android.tsx`) with Edit my session, Add player, Share
  table, Table settings, each with its icon.
- **Sheets** (`components/ui/Sheet.tsx`, Android path): a drag handle, 28dp top corners, the close
  (or back) icon button at the start and the title centred. A sheet that leads from another shows
  back only (`AndBuyIn`).
- **Amount entry** (`features/AmountKeypad.tsx`, `RecordingForms.tsx`): the amount centred, then the
  "becomes…" line and its sum, then the main button, then the keypad. Rebuy, rebuy for a player,
  and Edit buy-in all follow this order.
- **Buy-in mode**: Add, Subtract and Set total as a connected button group (2dp gaps, 8dp inner
  corners, round outer; selected is ink with a check). Use the `@expo/ui` Compose button group if
  it exists in the installed SDK, else draw it.
- **Edit my session**: a list with Buy-in total ›, Started as two chips (date, time) that open the
  Material date and time pickers (`DateTimeField.android.tsx`), Game as a chip ›, Casino; a red
  **Delete session** text button; **Done**.
- **Delete** (`AndDeleteSession`): a Material alert dialog (28dp corners, icon, headline,
  supporting text, **Keep session** and **Delete session** text buttons, the destructive one in
  loss red), not a sheet.
- **Cash out**: rows for Cash-out (20px bold amount), Finished (date and time chips), and the
  result; **Busted · $0** tonal beside **End session**; keypad below.
- **Shared table**: the player list on the felt with avatars, status lines and chevrons for players
  you can act on; cashed-out players dimmed; **Sit down and play** as a wide tonal button for a
  recorder. **Add player** uses Material filled text fields for Name and First buy-in, and a
  "Saved on this phone" list with tonal **Add** buttons.
- **Snackbar** after a rebuy: inverse surface, 4dp corners, **Undo**.
- **Finished** (`AndFinished`): back and pencil; game tile, title and two meta lines; the result
  card with sentence-case labels; "At this table" and "Your history" sections (voided entries
  struck through); the outlined **Undo cash-out** and filled **Back at the table**.
- **Back button label:** "Back to your play" only while you're playing; otherwise it names where
  it goes.

## Audit findings (2026-11-16)

What the audit found against these frames, beyond the Design above:

- **The felt:**
  - The app bar uses solid white or charcoal circles.
  - The dock has no darker felt background, and its colours are inverted: white rebuy pills and a
    black Cash out in light.
- **Snackbars** are sometimes light and sometimes dark, with 14–16dp corners and a pill Undo.
- **Add player** hides saved players behind a dropdown.
- **Shared tables** wrap players in an "At this table" card with no avatars or cents, and list the
  You row twice.
- **The recorder and cashed-out-starter heroes** are centred, without cents, venue or start time,
  and Sit down is black.
- **Finished:**
  - Has no game chip or result divider.
  - Shows an unstyled Add player / Share / Table settings row, even on a closed table. Drop it.
  - Uses the labels "History" and "Final cash-out".
- **"Other" game:** Start session's "Other" has no field for its name.
- **Add past session:** amounts have no currency prefix and no result preview.

## Non-goals

- Ledger behaviour; only presentation changes. Entries stay immutable.

## Plan

- [x] Felt app bar actions per role
- [x] Sheet header on Android (close or back at the start)
- [x] Amount entry order and centred amount
- [x] Buy-in connected button group
- [x] Edit sheet date and time chips
- [x] Delete as an alert dialog
- [x] Cash-out rows and buttons
- [x] Shared-table player list, recorder button, Add player text fields
- [x] Snackbar shape
- [x] Finished layout and copy
- [x] Back button label per role
- [x] "Other" game name; past-session amount prefix and result preview

## Test

- [x] Each frame above matches on the emulator, light and dark (019's protocol)
- [x] `solo-recording.yaml` and `shared-table.yaml` pass on Android
