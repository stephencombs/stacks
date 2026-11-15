---
status: complete
created: 2026-11-14
priority: medium
tags:
  - recording
  - web
  - mobile
  - api
depends_on:
  - "008"
parent: "001"
created_at: 2026-11-14T20:15:31.156529651Z
updated_at: 2026-11-15T21:19:14.789497801Z
completed_at: 2026-11-15T21:19:14.789497801Z
transitions:
  - status: in-progress
    at: 2026-11-15T21:19:14.367186444Z
  - status: complete
    at: 2026-11-15T21:19:14.789497801Z
---

# Shared table on the live screen

## Overview

Bring the shared table onto the felt screen from spec 008, following "my session first": your own money leads, and the table's players are listed under it. The recording rules for shared tables (starter, joiner, recorder, share links, invites) already exist; this spec is their screen, plus recording a table without playing.

## Design

- **Your session first:** the LIVE pill shows the table's time; the big number is what you bought in; then everyone at the table: name, status ("Playing", "Playing · sat down 10:05 PM", "Cashed out 10:52 PM · $200.00 in"), and amount in or result. Cashed-out players stay listed, faded, with their result.
- **What you can do decides the action slot** (spec 008's rule):
  - Starter: ⋯ menu with Edit my session, Add player, Share table, Table settings, while the table is live.
  - Joiner: one pencil button, Edit my session (with **Delete my visit**).
  - Recorder: one button, Add player.
  - Never label a role on screen.
- **Recording for others:** the starter or a recorder taps a player's row to open their sheet: rebuy ("Priya's buy-in becomes $300.00") or cash out ("Priya's visit ends. You, Dev and Jonah keep playing.").
- **Add player:** name and first buy-in, or a player saved on this device; "Add Sam · $200.00".
- **Not playing:** a starter who cashed out while others play sees the table view: "In play at the table $1,000.00", "3 playing", the list, and **Sit down and play**.
- **Recording without playing (last):** start a table with no buy-in of your own, or appoint a recorder who never sits down. Needs a table start that isn't a visit, a table address to return to, and changes to the `start` command (it requires a buy-in) and the "Table has no visit." invariant in `packages/client-runtime/src/recordingState.ts`. `docs/internals/navigation.md` says there is no table page; update its Shared tables and Addresses sections with the table address.
- Designs: `Mp*` frames on the 003 · Live session page.
- **Way out of an empty table:** a table nobody has played at can be deleted (`delete_table`), so one opened by mistake doesn't sit in the LiveBar. Deleting it also takes it out of its trip. Once anyone plays there, it stays, even if they delete their visit.

## Plan

- [x] Table list under your session, with faded cashed-out players, web and mobile
- [x] Action slot by permission; ⋯ menu, Add player, Share table, Table settings
- [x] Rebuy and cash out for another player
- [x] Not-playing table view and Sit down and play
- [x] Recording a table without playing, and recorders who never sit down: contracts, shared logic, API, screen, navigation.md

## Test

- [x] Starter, joiner and recorder each see only the actions their permissions allow, and the API refuses the rest
- [x] Cashing out another player leaves the table open until the last player
- [x] A table started without playing can be recorded for, shared and finished
