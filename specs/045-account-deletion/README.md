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
Apple's rule is guideline 5.1.1(v), and Google Play's is its account deletion policy, which also
asks for a web link. `You.tsx` only signs out. This spec adds real deletion: the account record
and the person's data are removed, except the ledger rows their friends' balances depend on.
Those stay, with nothing left that ties them to the person.

## Research: do we delete all their data?

Not quite all. Delete everything that is only theirs, and make the shared ledger rows anonymous.

- **Apple.** Delete "the entire account record, along with associated personal data". Turning
  the account off for a while doesn't count, and data you must keep by law may stay if you tell
  the user what stays. Apple also says people expect content shared with others to be deleted.
  That is the grey area for ledger rows. Apps that use Sign in with Apple should revoke the
  user's tokens with `/auth/revoke` ([support page][apple], [TN3194][tn3194]).
- **Google Play.** Needs an in-app path and a web link where people can ask for deletion. Data
  may be kept for security, fraud prevention or regulatory compliance, as long as users are told
  ([policy][play]).
- **GDPR.** Art. 17 grants erasure. Art. 17(3)(e) allows keeping data needed for legal claims.
  Recital 26 puts truly anonymous data outside the GDPR, but pseudonymous data is still personal
  data ([Art. 17][art17], [Recital 26][r26]).
- **Precedent.** Splitwise keeps shared expenses for the other members and removes the leaving
  person's name and contact details ([privacy][splitwise]).
- **Why rows stay.** A buy-in or a stake is also the friends' record of money that changed hands.
  Hard-deleting it would rewrite their results and debts. Keeping it rests on their legitimate
  interest and on possible claims, such as open stakes.
- **Limit to state openly.** Friends at the same table know who "Former member" was. Their memory
  isn't our data. Everything we can control is cut: the name, account, claim codes, invites,
  devices and free-text notes.

## Model

- **The server deletes in one transaction** (`Account.delete`, in a new
  `apps/api/src/features/Account.ts`). It is an all-or-nothing operation, then Clerk.
- **One tombstone per deletion.** Insert a `users` row with a new random ID, the name "Former
  member" and no avatar. Point every audit column that can't be null at it: `created_by` on
  `entries`, `stakes`, `sessions`, `seatings`, `trips`, `groups`, `invites` and
  `personal_entries`, plus `membership_absences.user_id`. Set nullable ones (`voided_by`,
  `closed_by`, `players.created_by`, `venues.created_by`) to `null`. The tombstone links to
  nothing, so it carries no identity.
- **Their players stay as anonymous rows.** Set `user_id`, `claim_code` and `claimed_at` to null
  and rename the player "Former member". `tellApart` already separates two of them. Balances,
  results and stakes stay keyed by the same player ID and don't change.
- **Delete what is only theirs.**
  - Memberships.
  - Group invites they created.
  - Personal invites for their players.
  - Their account recording actor and every `player_actors` binding to their players, so no
    device can record as them again.
  - Notes on entries for their players.
  - Visits, entries and operations at tables where no one else took part.
  - Groups where they are the only member, with everything in them.
  - Names in `personal_operations.command` (for example `join_table.displayName`) for their
    players.
  - Finally, the `users` row.
- **Ownership passes on, it doesn't block.** In a group with other active members, ownership goes
  to the longest-standing admin, or else to the longest-standing member. Blocking deletion until
  the user settles up or hands groups over is the "unnecessarily difficult" pattern Apple
  rejects.
- **Unsettled money doesn't block either.** The confirmation shows what they still owe or are
  owed. Those balances remain for friends, owed to or by "Former member".
- **Clerk afterwards.** Once the transaction commits, the server deletes the Clerk user with the
  Backend API (`DELETE /v1/users/{id}`). If that call fails, the app data is already gone. Retry
  it, and log it so it can be finished by hand. Clerk holds the email and sign-in methods, so
  this step is required.
- **Apple tokens.** Clerk's native flow never receives Apple's authorization code, so as far as
  we know it can't revoke the tokens itself. For users with Apple linked, the app shows the
  Apple sheet at deletion to get a fresh authorization code. The server exchanges it at
  `/auth/token` and calls `/auth/revoke`. Apple returns 200 even when the client secret is bad,
  so test with a real key. Depends on spec 044. Without Apple linked, skip this step.
- **Devices.** Live sockets close (`Realtime.closed` for each group). The app signs out of Clerk,
  wipes the account's local data, and returns to Landing.

## Requirements

- [ ] **Failing test first** (`Account.test.ts`, using the fixture `users(...)`): Alice and Bob
      share a group, a trip, a shared table, a stake and an open balance, and Alice also has a
      solo table. Delete Alice. Bob's balances, results and stake are unchanged. Nothing anywhere
      references Alice's user ID. Her solo table is gone. Her player is "Former member" with no
      claim code, binding or invites.
- [ ] **Contracts.** `POST /account/delete`, with an optional Apple `authorizationCode`. Errors
      are typed.
- [ ] **Server.** `Account.delete` and its thin handler. Transfer ownership. Close realtime.
      Delete the Clerk user with a retry. Revoke the Apple token when a code is sent.
- [ ] **Mobile: You.** A destructive "Delete account" row, under sign-out.
- [ ] **Mobile: the confirmation sheet.** It lists what is deleted, what stays anonymous for
      friends, groups whose ownership moves, and open balances. It offers the existing CSV export
      first. Confirming needs one deliberate tap on "Delete account" and shows a pending state.
      On success, wipe local data and show Landing.
- [ ] **Web link for Play.** A public page served by the Worker that explains how deletion works
      and takes a request by email. Put its URL in Play Console's Data safety form.
- [ ] **Disclosures.** The privacy policy, App Store privacy details and Play Data safety say what
      is deleted and what stays anonymous.
- [ ] **Docs.** A short `docs/internals/` note: why ledger rows are made anonymous rather than
      deleted, and the tombstone rule for new audit columns.

## Tests

- [ ] Every column that references `users` or a player is covered. A test lists the foreign keys
      from `information_schema`, so a new one fails until it's handled.
- [ ] Ownership moves to an admin first, then to a member. A group with only the deleted user is
      deleted.
- [ ] Two deleted members in one group stay separate rows that `tellApart` can tell apart.
- [ ] A failed Clerk delete leaves the app data deleted and records a retry. A second request is
      harmless.
- [ ] Component: the sheet shows balances and ownership moves, and success wipes local data.

## Non-goals

- A grace period, undo, or turning an account off for a while.
- Deleting friends' guests or entries that the deleted user recorded for other people.
- Account merging.
- Deleting PostHog data: it's set to `personProfiles: "never"`, so no person is tied to an
  account.

## Open decisions

- **Email for the web request.** Which address goes on the page? Or should a Clerk-authenticated
  page be added instead?
- **Placeholder name.** "Former member", or something warmer?

## Acceptance criteria

- [ ] On iOS and Android, a user deletes their account in the app and lands signed out, seen in
      the native app.
- [ ] Their Clerk user is gone. With Apple linked, the Apple ID's settings no longer list Color Up.
- [ ] Friends' balances and results are identical before and after.
- [ ] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, `pnpm test` pass.

[apple]: https://developer.apple.com/support/offering-account-deletion-in-your-app/
[tn3194]: https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple
[play]: https://support.google.com/googleplay/android-developer/answer/13327111
[art17]: https://gdpr-info.eu/art-17-gdpr/
[r26]: https://gdpr-info.eu/recitals/no-26/
[splitwise]: https://www.splitwise.com/privacy
