---
status: draft
created: 2026-11-24
priority: high
tags:
  - api
  - mobile
  - contracts
  - privacy
created_at: 2026-11-24T03:33:37.146142700Z
updated_at: 2026-11-24T03:33:37.146142700Z
---

# Delete your account

## Overview

Both stores require that anyone who can create an account can delete it from inside the app.
Apple's rule is guideline 5.1.1(v); Google Play's account deletion policy also asks for a web
link. `You.tsx` only signs out. This spec adds real deletion. The account, and everything only it
owns, is removed. The person's player in each shared group becomes a guest again, as if a friend
had added them by name, with their play and balances unchanged.

## Research: do we delete all their data?

Not all of it. Delete the account and everything that is only theirs. In shared groups, their
player goes back to being a guest, and keeps the name and ledger rows.

- **Apple.** Delete "the entire account record, along with associated personal data". Turning
  the account off for a while doesn't count. Data you must keep may stay if you tell the user
  what stays. Apple also says people expect content shared with others to be deleted, which is
  the grey area here. Apps that use Sign in with Apple should revoke the user's tokens
  ([support page][apple], [TN3194][tn3194]).
- **Google Play.** Needs an in-app path, and a web page where someone who has uninstalled the app
  can ask for deletion. Data may be kept for stated reasons, if users are told ([policy][play]).
- **GDPR.** Art. 17 grants erasure, with exceptions in 17(3). Art. 21 lets a person object to
  processing based on legitimate interest. Recital 26 puts truly anonymous data outside the GDPR
  ([Art. 17][art17], [Recital 26][r26]).
- **Precedent.** Splitwise keeps shared expenses for the remaining members and removes the
  leaving person's name ([privacy][splitwise]).
- **Why rows stay.** A buy-in or a stake is also the friends' record of money that changed hands.
  Hard-deleting it would rewrite their results and debts.
- **Why the name stays too.** Friends track anyone at a table or in a group by name, whether or
  not that person ever has an account. Deleting an account removes what the account added:
  sign-in, email, avatar, memberships and devices. It doesn't remove the friends' own record of
  who played.
  - This goes further than Splitwise. It rests on the friends' legitimate interest, which makes
    it open to objection under Art. 21. So there is a route to remove the name on request (see
    Model), and the confirmation, the privacy policy and the App Review notes all say plainly
    what stays.

## Model

### What happens to their players

- **Group players become claimable guests.** Clear `user_id` and `claimed_at`, keep
  `display_name`, and issue a fresh `claim_code` (`Access.randomCode()`). The player then shows
  under Guests in `GroupPeople` with **Send claim link**, rather than under Former members.
  Balances, results and stakes keep the same player ID.
- **Their personal (table) player is detached, not deleted.** Other people's tables reference it:
  `tables.starter_player_id`, visits, operations and `counterparty_id`. Clear `user_id` and
  `recording_actor_id`, and keep the name. A migration relaxes `players_kind`
  (`0018_claimed_table_players.ts:13`) to allow this detached kind.
- **Group attribution is fixed in place first.** `TripTables.load` (`TripTables.ts:125`)
  attributes a table visit to a group player through `user_id` and membership dates. Before
  clearing `user_id`, copy each affected visit's current attribution into a new
  `personal_visits.group_player_id`, and have `TripTables.load` use it when it's set. Standings,
  results and balances come out identical, including with an absence in the history.
- **Shared tables they started.** Revoke the share token (`share_token_hash = null`). Recorders
  they appointed keep recording for everyone. Other participants keep recording their own play.
  Open visits of the deleted player stay open until a recorder cashes them out.

### What is deleted

- Their memberships, deleting `membership_absences` first (the composite FK in
  `0023_membership_absences.ts:11`).
- Group invites they created.
- Their account recording actor, and every `player_actors` binding to their players, both active
  and revoked. Clear `invited_by_actor` references to the actor, and delete the `player_invites`
  it issued. Delete personal invites for their players.
- Groups where they are the only member, with everything in them, children before parents:
  entries, stakes, sessions, seatings, trips, the group's own venues, then the group. A
  personal table that sits in such a trip is detached from it (`tables.trip_id`).
- Tables where nobody else took part, with their visits, entries and operations.
- Finally, the `users` row.

### Audit columns

- **One reserved audit user.** A migration inserts `users` row `deleted-account`, with the name
  "Deleted account". It can never sign in, because `UserId` is a Clerk subject and this ID can't
  be one. Every surviving user audit column moves to it:
  - the `created_by` columns of `entries`, `stakes`, `sessions`, `seatings`, `trips`, `groups`
    and `players`,
  - `voided_by` on voided `entries` and `stakes`, since `(voided_at is null) = (voided_by is null)`
    must hold,
  - `sessions.closed_by`.

  `venues.created_by` (nullable) is set to null. Void timestamps don't change.

- **`personal_entries` and `personal_operations` use UUIDs, not users.** Their `created_by`,
  `voided_by` and `actor_id` hold recording-actor IDs; confirm this against
  `0012_personal_recording.ts`. Where the deleted account's actor appears, replace it with one
  reserved, unbound actor, following the same idea as the audit user. Also rewrite that actor's ID
  inside `personal_operations.command`, so replay never refers to a deleted actor.
- **The append-only trigger.** `entries_append_only` (`0001_init.ts:170`) rejects updates and
  deletes. The migration lets it pass only when a transaction-local setting is on
  (`set local stacks.account_deletion = 'on'`), which only `Account.delete` sets. Never disable
  the trigger.

### Durability, fences and Clerk

- **A deletion job, written in the same transaction.** Add an `account_deletions` table holding
  `user_id_hash`, `requested_at`, `clerk_deleted_at` and `apple_revoked`. Its row is the fence.
  - Both normal and recording auth reject a token whose subject hash is in it, so a still-valid
    Clerk token can't recreate the user through `ensureUser`.
  - `Account.delete` takes a transaction advisory lock on the user, and account writes check the
    fence inside their own transaction under the same lock. So an in-flight write either commits
    before the cleanup or is rejected after it.
- **Clerk after commit.** Make a bounded retry of `DELETE /v1/users/{id}` in the request, and
  treat Clerk's "not found" as success. If it still fails, a Worker cron trigger retries any job
  without `clerk_deleted_at`. The endpoint reports `pending` or `complete`. The fence row stays,
  because it holds no identity, only a hash.
- **Idempotent.** A second request, or a request that lost its response, finds the job and returns
  its state without repeating the cleanup.
- **Realtime after commit.**
  - Close the deleted user's group sockets, the table sockets of their actor, and connections
    that came in through a share link that was revoked.
  - Send `Realtime.changed` to the groups and tables that survive, so friends see the new owner
    and the guest.

### Ownership, money and Apple

- **Ownership passes on; nothing blocks.** In a group with other active members, ownership goes to
  the longest-standing admin, or else to the longest-standing member. Unsettled balances and open
  stakes carry over to the guest. Blocking on either is the "unnecessarily difficult" pattern
  Apple rejects.
- **Apple revocation never blocks deletion.**
  - When the account has Apple linked and the device is iOS, the app asks the Apple sheet for a
    fresh authorization code. The server exchanges it at `/auth/token` and calls `/auth/revoke`
    with the native app's client ID. That needs secrets `APPLE_TEAM_ID`, `APPLE_KEY_ID` and
    `APPLE_PRIVATE_KEY`.
  - On Android, or if the sheet is cancelled or revocation fails, deletion still completes. The
    app then shows how to remove Color Up under Settings → Apple Account → Sign in with Apple, as
    TN3194 advises. Depends on spec 048.
- **Removing the name on request.** An admin script (`apps/api/scripts`) renames a former
  account's guest to "Former player" and wipes notes on its entries. It handles Art. 21
  objections and requests made to the support address. The runbook is the internal doc.

### On the device

- **Order:** stop sync and the realtime connection, end any Live Activity or Android Live Update,
  then wipe:
  - the recording store (`color-up-recording.db`), which includes device-only play, and the
    confirmation says so,
  - the SecureStore actor key (`color-up-actor`),
  - `outbox-<userId>.json`, `last-trip-<userId>` and `stats-<userId>-*.json`,
  - `contact-photos/` (spec 047).

  Then sign out of Clerk and go to the signed-out Play tab. Crew shows Landing.

- **Recovery.** The wipe is safe to repeat. If the app is killed partway through, it finishes the
  wipe at the next launch, because a marker is set before the wipe starts. Another signed-in
  device gets an auth rejection from the fence, and runs the same wipe.

## Requirements

- [x] **Failing test first** (`Account.test.ts`, with `users(...)` from
      `apps/api/src/testing/fixtures.test-utils.ts`). Alice and Bob share a group, a trip with a
      table and an absence, a shared table Alice started with an appointed recorder, a stake, an
      open balance, and a voided entry. Alice also has a solo table and a solo group. Delete
      Alice, then check:
  - Bob's standings, results, balances and stake are unchanged.
  - Nothing references Alice's user ID.
  - Her solo table and solo group are gone.
  - Her group player is a claimable guest named "Alice", and her table player is detached.
  - The recorder can still record at her table, and its share link no longer works.
  - Bob sends the claim link, and a new account claims it.
- [x] **Migration `0025_account_deletion`.** Adds the audit user and actor,
      `personal_visits.group_player_id`, `account_deletions`, the trigger guard, and the relaxed
      `players_kind`.
- [x] **Contracts.**
  - `GET /account/deletion-preview` returns solo groups to delete, ownership moves with the new
    owner, open balances and stakes, and whether Apple is linked.
  - `POST /account/delete` takes an optional Apple `authorizationCode`, and returns `pending` or
    `complete`.
  - Errors are typed.
- [x] **Server.** `Account.ts` with `Account.preview` and `Account.delete`, thin handlers, the
      fence in both auth layers, the cron retry, the Apple revoke, and the after-commit realtime.
- [ ] **Mobile: You.** On both platforms, Sign out and Delete account sit together in an account
      `SettingsGroup`. On Android they move out of the sheet footer.
- [ ] **Mobile: the confirmation sheet.** It loads the preview and handles loading, offline and
      error states. It says:
  - what is deleted, including play recorded only on this phone,
  - what friends keep: your name and play in shared groups, as a guest,
  - which groups change owner, and your open balances.

  It offers the CSV export first. Its buttons are "Delete account" (`danger`) and "Keep account"
  (`secondary`), with `busy` while pending. On success it runs the device wipe. On `pending` it
  wipes anyway and says the sign-in record will finish deleting shortly.

- [ ] **Web page for Play.** This depends on spec 050's domain, not `workers.dev`. It is a public
      page with no login, which leads with how to ask for deletion without the app: email the
      support address from your account's email. It also lists:
  - the app and developer name,
  - what is deleted and what is kept as a guest,
  - how long it's kept: as long as the friends' group exists,
  - a 30-day response time, and the in-app path.

  The runbook covers checking that the request came from the account's email address and
  running `Account.delete` for that user.

- [ ] **Disclosures.** The privacy policy, App Store privacy details, Play Data safety and App
      Review notes cover what is deleted, what friends keep and why, how long, and how to ask for
      the name to be removed.
- [x] **Docs.** A short `docs/internals/` note: why a deleted account becomes a guest, the audit
      user and actor, the trigger guard, and the rule that any new user or player column needs a
      deletion rule.

## Tests

- [x] Every foreign key that references `users`, `players` or `recording_actors` has a deletion
      rule. A test reads them from `information_schema`, so a new key fails until it's handled.
- [x] A test covers both a native table and an imported legacy table, with replay after deletion.
- [x] Ownership moves to an admin first, then a member.
- [x] Each of these is safe: a lost response, a failed Clerk call that the cron later finishes, a
      stale token used after deletion (rejected), a duplicate request, and Clerk's "not found".
- [ ] The device wipe is safe to repeat, and resumes after the app is killed partway.
- [ ] Component: the sheet's states, and the Apple-cancelled path that shows manual removal steps.

## Non-goals

- A grace period, undo, or turning an account off for a while.
- Deleting friends' guests, or entries the deleted user recorded for other people.
- Account merging.
- Deleting PostHog data. It's set to `personProfiles: "never"`, so no person is tied to an
  account.
- Renaming guests in the app.

## Decisions

- **Support address.** A dedicated `support@<domain>` on spec 050's domain, never a personal
  address, since it is public on the web page and the store listing. It receives deletion
  requests made outside the app and requests to remove a guest's name.

## Acceptance criteria

- [ ] On iOS and Android, a user deletes their account in the app and lands signed out on Play,
      seen in the native app.
- [ ] Their Clerk user is gone. With Apple linked on iOS, the Apple ID no longer lists Color Up.
- [ ] Friends' balances, results and standings are identical before and after.
- [ ] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, `pnpm test` pass.

[apple]: https://developer.apple.com/support/offering-account-deletion-in-your-app/
[tn3194]: https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple
[play]: https://support.google.com/googleplay/android-developer/answer/13327111
[art17]: https://gdpr-info.eu/art-17-gdpr/
[r26]: https://gdpr-info.eu/recitals/no-26/
[splitwise]: https://www.splitwise.com/privacy
