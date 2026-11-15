---
status: in-progress
created: 2026-11-14
priority: medium
tags:
  - recording
  - api
  - web
  - mobile
depends_on:
  - "003"
parent: "001"
created_at: 2026-11-14T20:21:35.164878914Z
updated_at: 2026-11-15T18:08:38.127422807Z
transitions:
  - status: in-progress
    at: 2026-11-15T05:52:44.754669990Z
---

# Delete a session

## Overview

The live screen's edit sheet ends with **Delete session**. The ledger never erases: deleting voids your visit's entries and hides the visit, and it can be restored. Split from spec 008.

## Design

- **Who and what:** your own visits, live or finished. A starter or recorder can't delete someone else's visit. Imported legacy participations can't be deleted.
- **Confirm first:** "Delete this session?" with the session's game, casino, start and buy-in.
- **Effect:** every entry of the visit is voided, as any correction; a counterparty on an entry sees the void in their history, as with any void. The visit leaves Play, history totals and Stats.
- **Shared table:** only your visit goes. If you were the only player, the table goes with it.
- **Coming back:** an Undo toast restores it at once. After that, **All sessions** lists deleted visits at the end of their month, struck through, with **Restore**. Restoring brings back the visit, its entries and a removed table.
- New recording commands `delete_visit` and `restore_visit` in `packages/contracts/src/recordingCommands.ts`, applied in `packages/shared/src/recording.ts`, accepted by `apps/api/src/features/Recording.ts`.
- Designs: `DeleteSession` and the edit sheets on the 003 · Live session page.

## Plan

- [x] Commands, shared logic and API, with unit and API tests
- [x] Delete and undo on the live screen and Finished, web and mobile
- [x] Deleted visits in All sessions with Restore

## Test

- [x] Delete then restore returns every entry and total exactly (unit and API tests)
- [x] Deleting your visit on a shared table leaves the others' visits untouched; the API refuses deleting someone else's
- [x] A deleted visit is absent from Play and Stats, present in All sessions as deleted
- [x] Works offline and syncs
