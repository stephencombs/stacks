---
status: complete
created: 2026-11-23
tags:
  - api
  - client-runtime
  - mobile
  - realtime
depends_on:
  - 040-realtime-group-notices
parent: 039-realtime-scope-notices
created_at: 2026-11-23T17:39:55.984231700Z
updated_at: 2026-11-24T02:36:43.523238700Z
completed_at: 2026-11-24T02:36:43.523238700Z
transitions:
  - status: planned
    at: 2026-11-24T02:36:32.242471200Z
  - status: in-progress
    at: 2026-11-24T02:36:32.845161500Z
  - status: complete
    at: 2026-11-24T02:36:43.523238700Z
---

# Table change notices, end to end

## Overview

The second slice of `039-realtime-scope-notices` extends the pipeline from `040-realtime-group-notices` to tables. That's harder: Recording push commits each command separately, and table screens read through three different paths.

- **One-shot fetches** that never refresh: `useServerTable` (joined participants on `Play` and `Table`, and starters in `TableSettingsSheet`) and `SharedTableScreen`'s `fetchSharedTable`.
- **The on-device recording store.** Starters and appointed recorders render other players from local SQLite (`liveTable.ts`). It changes only when `sync.wake()` pulls `GET /api/recording`.

## Design

**Which writes notify which scopes.** Group IDs are captured inside the transaction, before and after the write.

| Write                                                                    | Scopes                                                                                                                                          |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Recording push: entries, visits, edits, `delete_table`, `set_table_trip` | `table`, plus the distinct union of the table's group before and after the write. `delete_table` clears `trip_id`, so read the old group first. |
| `appoint_recorder`, `revoke_recorder`, join, share, unshare              | `table` only. Trip views never read participants or share state.                                                                                |
| `claimActor`, `PlayerInvites.redeem`, `PlayerInvites.revokeBinding`      | The affected players' **open** tables (not deleted, with an unfinished visit), plus their groups                                                |

- Recording push queues only the commands that committed. Replays and rejected commands queue nothing.
- `PlayerInvites.issue` and `PlayerInvites.revoke` notify nothing.

**Origin.**

- Each write request sends `X-Origin`: a random per-install id, which isn't sensitive. The recording push sends it too.
- The notice carries it as `origin`, and a phone ignores notices it caused. Otherwise every rebuy would trigger a full `GET /api/recording` pull.

**Upgrade.** `table:` scopes accept:

- `Bearer`
- `Actor <id>.<secret>`
- `Share <token>`, which must resolve to the requested table

Every scheme applies the table GET's check, including `viewOf`'s rule that a table with every visit deleted is gone.

**Client subscribers.**

- `Play` and `Table`, for a synced table: `table:<id>`. A notice refetches `useServerTable` and calls `sync.wake()`.
- `SharedTableScreen`: `table:<id>`, with `Share` auth. A notice refetches `fetchSharedTable`.

`useServerTable` and `SharedTableScreen` gain a refetch trigger.

## Requirements

- [x] The write rows above queue their scopes after commit, with old group IDs captured.
- [x] `X-Origin` on every request that writes, and in the notice.
- [x] `Actor` and `Share` schemes on the upgrade route, and `table:` scopes accepted.
- [x] Refetch triggers for `useServerTable` and `SharedTableScreen`, `sync.wake()` on notice, and filtering by origin.

## Acceptance criteria

- [x] API tests cover:
  - a mixed batch of accepted and rejected commands
  - a replay
  - `delete_table`
  - `set_table_trip` within one group, across groups, and to `null`
  - `claimActor` limited to open tables
- [x] Upgrade tests:
  - each scheme
  - a share token for another table
  - a deleted table, and a table whose visits are all deleted
  - an unknown actor
- [x] A client test: the device's own `origin` triggers no refresh and no `sync.wake()`.
- [ ] Deployed `development`, normally within 2s of commit:
  - a joined participant's cash-out shows on the starter's `Play` screen
  - a cash-out shows for a share-link viewer
- [x] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, `pnpm test` pass.
