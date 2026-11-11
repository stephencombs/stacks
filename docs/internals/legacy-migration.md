# Legacy migration

The Group- and Trip-bound ledger (`sessions`, `entries`, `stakes`) moves into the player model
without losing or inventing facts. `apps/api/src/features/LegacyMigration.ts` holds two functions:
a read-only `preflight` and an `importLegacy` that copies legacy play into the new tables. Run them
with `pnpm --filter @stacks/api legacy:preflight` and `legacy:import` (a dry run unless `--apply`).
Neither changes what the app reads or writes; that is the cutover, which comes later.

## Mapping

| Legacy                               | New model                                                                                                                                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account (`users`)                    | Its one personal player (`players` with no group), created by the import if the account never synced. Devices adopt it as they do any account identity.                                                    |
| Claimed group player (`user_id` set) | Stays its own `players` row with its ID. `user_id` links it to the account's personal player. Its history is not copied into the personal player's. A group player is never claimed again through a table. |
| Guest                                | Stays its own `players` row. Two guests are never joined, even with the same name.                                                                                                                         |
| Session                              | A historical table whose ID is the session ID. Its trip, venue, game and high-limit flag stay on the session.                                                                                              |
| A player's part in a session         | One historical participation: a `personal_visits` row with `legacy_session_id` set, owned by the legacy player, from the session's start to its close.                                                     |
| Buy-in, cash-out, adjustment         | A `personal_entries` row with the same ID, amount, counterparty, times, note, void and `replaces_entry_id`.                                                                                                |
| Settlement                           | A `repayments` row with the same ID: a payment between two players, with its trip kept only as `recorded_from_trip_id`.                                                                                    |
| Stake                                | Stays in `stakes` as legacy terms, permanently. Whole-Trip backing applies only to agreements made after the cutover.                                                                                      |
| Group, membership, trip              | Unchanged. Access to a historical table or repayment goes through the legacy group, as it does today.                                                                                                      |
| Group in a currency other than USD   | Not imported. It stays on the legacy ledger until the new model supports its currency.                                                                                                                     |

Users who created or voided entries are audit actors in the new model, so each also gets a personal
player, and its `recording_actor_id` becomes the entry's `created_by` or `voided_by`.

## Why participations, not visits

A personal visit is one stay at a table: a player who leaves and comes back has two. A legacy
session records only when the whole table opened and closed, so it can't show whether a player left
and returned or when they finished. The import doesn't guess. Each player's part becomes one
participation, marked by `legacy_session_id`, and keeps the session's ID as its table.

Imported history is read-only: there is no flow to correct it. Participations have no command log
and take no recording commands, because their owner is a group player and the recording API only
loads visits owned by the account's personal player. Replay in `packages/shared/src/recording.ts`
never sees them, so they need no synthetic command.

## Payments routed by net settle-up

Legacy settle-up suggested payments from net balances, so someone could pay a player they didn't
owe. The import keeps each payment exactly as recorded, between the two players who made it. It
doesn't reassign debt or add balancing payments. The pair's balance then shows what's left between
those two people, and they settle it themselves. The preflight lists every such pair.

## Running it

The import runs on one repeatable-read snapshot in one transaction. It refuses to write while the
preflight finds a blocking issue. It only inserts rows that are missing, and brings over a later
void or a session's later close, so a second run reports zeros. A dry run does the same work and
rolls back. At the cutover, freeze legacy writes, close every open session and run it once more.

## Preflight

Blocking issues stop the import:

- `live_session`: an open session. Its play may still change, so it blocks the cutover until closed.
- `broken_correction`: a correction that replaces a live entry, an entry elsewhere, the other kind
  of fact, or an entry another correction already replaced.
- `invalid_audit`: an entry voided before it was created.
- `unsafe_amount`: an amount past what integer minor units count exactly.

Excluded groups don't block. The import skips them, and their open sessions don't count:

- `non_usd_group`: a group whose money isn't USD.

The import keeps these as they are and flags them for the people involved:

- `routed_settlement`: a pair whose payments turned their debt around or paid where nothing was
  owed.
- `windowed_stake` and `overlapping_stake`: stakes that cover part of a trip, or the same borrower
  twice. They stay legacy.
- `ambiguous_player`: players in one group with the same name. They stay separate until someone
  who owns both links them.
