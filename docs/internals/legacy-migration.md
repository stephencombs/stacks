# Legacy migration

The Group- and Trip-bound ledger (`sessions`, `entries`, `stakes`) moves into the player model
without losing or inventing facts. `apps/api/src/features/LegacyMigration.ts` holds two functions:
a read-only `preflight` and an `importLegacy` that copies legacy play into the new tables. Run them
with `pnpm --filter @stacks/api legacy:preflight` and `legacy:import` (a dry run unless `--apply`).
Neither changes what the app reads or writes; that is the cutover, which comes later.

## Mapping

| Legacy                               | New model                                                                                                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account (`users`)                    | Its one personal player (`players` with no group). The import creates it if the account never synced, and devices adopt it as they do any account identity. |
| Claimed group player (`user_id` set) | Stays its own `players` row with its ID. `user_id` links it to the account's personal player. Its history is not copied into the personal player's.         |
| Guest                                | Stays its own `players` row. Two guests are never joined, even with the same name.                                                                          |
| Session                              | A historical table whose ID is the session ID. Its trip, venue, game and high-limit flag stay on the session.                                               |
| A player's part in a session         | One historical participation: a `personal_visits` row with `legacy_session_id` set, owned by the legacy player, from the session's start to its close.      |
| Buy-in, cash-out, adjustment         | A `personal_entries` row with the same ID, amount, counterparty, times, note, void and `replaces_entry_id`.                                                 |
| Settlement                           | A `repayments` row with the same ID: a payment from one player to another, with its trip kept only as `recorded_from_trip_id`.                              |
| Stake                                | Stays in `stakes`, unconverted. Every legacy stake is legacy terms until someone reconciles it with whole-Trip backing.                                     |
| Group, membership, trip              | Unchanged. Access to a historical table or repayment goes through the legacy group, as it does today.                                                       |

Users who created or voided entries are audit actors in the new model, so each also gets a personal
player, and its `recording_actor_id` becomes the entry's `created_by` or `voided_by`.

## Why participations, not visits

A personal visit is one stay at a table: a player who leaves and comes back has two. A legacy
session records only when the whole table opened and closed, so it can't show whether a player left
and returned or when they finished. The import doesn't guess. Each player's part becomes one
participation, marked by `legacy_session_id`, and keeps the session's ID as its table. These rows
are not visits a device recorded: they have no command log and take no recording commands, because
their owner is a group player and the recording API only loads visits owned by the account's
personal player. Replay rules in `packages/shared/src/recording.ts` never see them, so they need no
synthetic command.

## Running it

The import runs on one repeatable-read snapshot in one transaction. It refuses to write while the
preflight finds a blocking issue. It only inserts rows that are missing, and brings over a later
void or a session's later close or reopen, so a second run reports zeros. A dry run does the same
work and rolls back. At the cutover, freeze legacy writes and run it once more.

## Preflight

Blocking issues stop the import, because the new model can't hold the data as it is:

- `non_usd_group`: a group whose money isn't USD.
- `broken_correction`: a correction that replaces a live entry, an entry elsewhere, the other kind
  of fact, or an entry another correction already replaced.
- `invalid_audit`: an entry voided before it was created.
- `unsafe_amount`: an amount past what integer minor units count exactly.

Reconciliation issues are imported as they are. Someone has to decide on them before balances move
to player-to-player debt:

- `routed_settlement`: net settle-up had someone pay a player they didn't owe, so a pair's debt
  turns around or appears. The payment stays a payment between those two players. The import doesn't
  reassign debt or add balancing payments.
- `windowed_stake`: a stake that covers only part of its borrower's play in the trip.
- `overlapping_stake`: two live stakes covering the same borrower at once.
- `ambiguous_player`: players in one group with the same name. They stay separate until someone
  who owns both links them.
