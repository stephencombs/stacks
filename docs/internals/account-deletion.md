# Account deletion

Deleting an account removes what only the account owned and keeps what friends recorded. A group
player goes back to being a claimable guest with the same ID, name and ledger rows, so results,
balances and stakes come out the same. `Account.remove` does it in one transaction.

## What a deleted account leaves behind

- **The audit user.** Every `created_by`, `voided_by` and `closed_by` that named the account moves to
  the `users` row `deleted-account`. It can't sign in: a `UserId` is a Clerk subject.
- **The audit actor.** It has its own kind, `audit`, which no identity can be established as, no
  player bound to, and nothing can change or delete (triggers). `personal_entries.created_by`, `voided_by`, `personal_operations.actor_id`,
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
- A group is deleted only if no one else was ever in it (`memberships` rows, active or left): a
  former member's entries and stakes live there. Whether the deleted account was still a member
  doesn't matter. A group kept with no active member to inherit it stays as it is, with its guests and
  no owner. Nobody sees it until a former member rejoins through an invite that is still open, or
  someone claims a guest; whoever joins a group with no active owner becomes its owner
  (`Access.joiningRole`).
- Deleting, leaving, removal, roles, joins and claims all take the group row lock first
  (`Access.lockGroup`) and read who is in the group only after it, so the successor
  `Account.remove` picks can't leave while it promotes them. A promotion that touches no row fails
  the transaction, which retries. An owner's role is never changed through `setRole`.
- Locks are taken in one order, the order recording commands use: the group, `player_actors` rows,
  the account's tables, then memberships. `Account.remove` takes all of them up front, so it can't
  deadlock with a push.
- A table is deleted only if nobody else played at it **and** no surviving group's trip counts it.
  A table that only the deleted account played, in a trip with friends, is part of their results.
- The fence is `account_deletions`. Authentication rejects a token whose subject hash is in it, so a
  deleted person's other devices get a 401 and wipe themselves. `POST /account/delete` alone uses
  `AccountAuthentication`, which verifies the token but skips the fence, so a lost response is
  recovered by asking again: the answer is the job's state, `pending` or `complete`, and nothing is
  repeated. The fence row stays for good because it holds a hash, not an identity. `user_id` is kept
  on it only until Clerk confirms the deletion. A refused token carries `reason: "account_deleted"`
  on its 401, so an app can tell a deleted account from an expired session. `RecordingAuthentication`
  lists the `bearer` scheme last, because the middleware returns the last scheme's error.
- The cron claims due jobs with a lease (`for update skip locked`), so overlapping runs take
  different jobs, and a job that fails waits `2^attempts` minutes (capped at six hours; the exponent is
  capped too, or `power` overflows). A new job isn't due for ten minutes, so the cron doesn't race the
  request that made it. Each Clerk and Apple call is cut off after ten seconds.
- A write that was in flight when the fence committed is stopped inside its own transaction:
  recording commands and share links take the shared fence lock and read the recorder's bindings
  `for share`, so a recorder resolved before the deletion can't write after it.
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

## On the phone

Deleting from You asks the API first, then hands the phone to a wipe. `AccountWipeScreen` replaces
the whole app while it runs, which is what stops sync and realtime: nothing is mounted to keep
writing. The wipe ends the Live Activity or Live Update, closes the recording store and deletes
its database, forgets the device actor, removes the account's outbox, last trip and stats copies,
then signs out of Clerk. _Done_ reloads the app signed out, on Play.

- **The marker comes first.** `account-wipe.json` is written before any step and removed only after
  sign-out, so an app killed partway finishes at the next launch, from the same screen. Every
  step must succeed when what it removes is already gone. A new file or key kept per user needs a
  step in `lib/accountDeletion.ts`.
- **A refused token is not proof.** The fence answers a deleted account's other devices with 401,
  but the API gives the same 401 to a token it can't verify, such as a bad deploy. Wiping on that
  would cost people play that exists only on their phone. So a 401 starts a wipe only when a fresh
  session token is refused too, checked at most once a minute. A typed "account deleted" error
  from the fence would remove the doubt.
- **Apple.** The code comes from `expo-apple-authentication` on iOS just before the request. A
  cancelled sheet, or Android, doesn't stop the deletion; the wipe screen then shows how to remove
  Color Up from the Apple Account by hand.
