# Account deletion

Deleting an account removes what only the account owned and keeps what friends recorded. A group
player goes back to being a claimable guest with the same ID, name and ledger rows, so results,
balances and stakes come out the same. `Account.remove` does it in one transaction.

## What a deleted account leaves behind

- **The audit user.** Every `created_by`, `voided_by` and `closed_by` that named the account moves to
  the `users` row `deleted-account`. It can't sign in: a `UserId` is a Clerk subject.
- **The audit actor.** `personal_entries.created_by`, `voided_by`, `personal_operations.actor_id`,
  the actor ids inside `personal_operations.command`, and `players.created_by_actor` move to one
  unbound `recording_actors` row. Replaying a table never meets an actor that was deleted.
- **A detached table player.** The account's personal player keeps its name, visits and entries but
  loses `user_id` and its actor; `players_kind` allows that with `created_by = 'deleted-account'`.
- **Pinned attribution.** `TripTables.load` counts a table visit for a group member by `user_id` and
  membership dates, which a guest no longer has. `Account.remove` copies each visit's attribution
  into `personal_visits.group_player_id` first, and the loader prefers it while that player is in the
  table's group.

## Traps

- `entries_append_only` stays on. It lets a statement through only when `stacks.account_deletion` is
  `on` for the transaction, which only `Account.remove` sets. Never disable the trigger instead.
- A table is deleted only if nobody else played at it **and** no surviving group's trip counts it.
  A table that only the deleted account played, in a trip with friends, is part of their results.
- The fence is `account_deletions`. Authentication rejects a token whose subject hash is in it, so a
  deleted person's other devices get a 401 and wipe themselves. It means a repeated `POST` can't
  reach the endpoint either: a client that gets a 401 after asking to delete should treat the
  account as deleted. The fence row stays for good because it holds a hash, not an identity.
  `user_id` is kept on it only until Clerk confirms the deletion, which is what the cron retries.
- `Access.ensureUser` is the one write that can recreate a user. It takes the user's advisory lock
  (`Account.remove` holds it exclusively) and refuses a fenced user. Other writes name the user in a
  foreign key, so one that loses the race fails instead of landing.
- The legacy importer maps an entry's author to a recording actor. Entries by `deleted-account` map to
  the audit actor, and the importer never makes an identity for that user.
- Apple revocation is best effort: the authorization code is single use and short lived, so it is
  never retried. It needs `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (the `.p8` PEM) and
  `APPLE_CLIENT_ID` (the bundle ID the code was issued to) on the Worker.

## Adding a user, player or actor column

A foreign key that points at `users`, `players` or `recording_actors` needs a deletion rule in
`Account.remove`: delete, clear, or move to the audit user or actor. `Account.test.ts` lists every
such key from `pg_constraint` and fails on one it doesn't know. A column that holds a user or actor id
without a foreign key (`personal_entries.created_by`) needs the same care and has no test to remind
you.
