---
status: draft
created: 2026-11-23
priority: medium
tags:
  - recording
  - api
  - contracts
  - mobile
created_at: 2026-11-23T04:43:46.424466900Z
updated_at: 2026-11-23T04:55:43.000884600Z
---

# Appoint recorders before they have an account

## Overview

A starter can appoint only players an account actor holds at the table. A player added by name
qualifies only after someone redeems their invite while signed in, and Table settings never says
so: the Recorders section shows "Nobody here has an account yet" and stops there.

Let the starter appoint any eligible player. The appointment waits until an account holds the
player, then works with no further step. The rule in `PLAN.md` that a recorder needs an account
moves from appointment time to the moment someone records.

This also closes a reachable hole (Sol 6.2 review, by code reading). An account that joins through
the share link holds its player with a `join` binding. The starter can appoint that player, then
issue a personal invite for it (`PlayerInvites.ts:57` skips only `self` bindings). A signed-out
device redeems it (`PlayerInvites.ts:261` skips the ownership check for devices), and `authorize`
(`packages/shared/src/recording.ts:65`) gives that device recorder power.

## Model

- **Appointments stay raw.** `appoint_recorder` / `revoke_recorder` in the table's stream, as
  today. The reducer's duplicate check and **Stop** keep reading the full appointment list.
- **Eligible** to be appointed: a player with a link participant row or a non-deleted visit at
  the table, other than the starter. This is its own predicate. `participantsAt` (which needs an
  invite binding for visits) stays as it is for participant authorization.
- **Active** for an acting actor: the actor is `kind = 'account'` and holds a live binding to an
  appointed player. Otherwise that actor records only its own player's play.
- **The server decides activity, the client follows.** `RecordingHistory` adds the tables where
  the requesting actor's appointment is active. The client grants optimistic recorder power only
  at those tables, never from its own idea of whether it's signed in. Persisted `actor.userId`
  and `sync.userId` can't be trusted for this (both can lag a sign-in or survive a sign-out).
- Deleting a player's last visit doesn't revoke an appointment, but they stop being eligible for
  a new one. **Stop** still works on any surviving appointment.

## Requirements

- [ ] **Failing test first** (`InvitesRecorders.test.ts`, from `tableWithAccount`): appoint the
      joined account player, invite them, redeem on a signed-out device. The redemption and the
      device's own write succeed. A write for another player is `forbidden`, `viewerRole` is
      `participant`, and its history leaves out the other player's visit and the appointment.
- [ ] **Server: eligibility.** The `appoint_recorder` branch (`Recording.ts:360`) uses the
      eligible predicate, and rejects the starter explicitly. Drop the account check.
- [ ] **Server: gate on use.** Apply the active rule in `lockTable` (table admission and the
      recorder privilege passed to the reducer), `tableAccess` (`viewerRole`) and the history
      scope (`Recording.ts:833`).
- [ ] **Shared: privilege apart from appointments.** `authorize` and the table metadata check
      (`recording.ts:514`) take the acting actor's active recorder tables, not the raw list.
      Accepted receipts still replay.
- [ ] **Client: every recorder read.** Use the active tables in local saves
      (`client-runtime/src/recording.ts:486`), pending replay during pulls and push
      reconciliation, retry of refused commands, `recordingHome`'s recorder-only tables
      (`recordingView.ts:173`) and `recordingTable`'s role, selected player and addable players
      (`recordingView.ts:304`).
- [ ] **Contracts.** `TableView.appointable` widens to eligible IDs. `recorders` stays the
      appointment IDs. Add a starter-only `activeRecorders` subset. `RecordingHistory` adds the
      requester's active recorder tables.
- [ ] **Mobile: Recorders** (`TableSettingsSheet`). Lists eligible players with **Make
      recorder** / **Stop**. Pending: "Records for everyone once they sign in". Active: "Records
      for everyone". Drop the account-only copy and the dead end. Refetch the server table when
      the sheet opens and after each appoint or stop, so a claim made elsewhere shows up.
- [ ] **Mobile: invites.** For an appointed player, both the sender's invite sheet and the
      recipient's screen (`screens/RedeemInvite.tsx`) say signing in also lets them record for
      everyone while the appointment stands.
- [ ] **Docs.** `PLAN.md` says the starter can appoint eligible players before they have
      accounts, and recording for everyone needs an account binding. Update the Table settings
      line in `docs/internals/navigation.md`.

## Tests

- [ ] Appoint a player added by name, then activate through each path: signed-in redemption,
      claim by adoption (device actor upgraded in place), and claim by link (bound to an existing
      account actor). Each path needs its own invite token, since links work once.
- [ ] Claim by link when the device's old `self` appears only in `ownedPlayerIds`: the client
      merge (`recordingSync.ts:288`) accepts the server link.
- [ ] Revoking the last account binding removes recorder power and leaves the appointment
      pending. **Stop** on a pending appointment means a later sign-in grants nothing.
- [ ] Appointing the starter, an ineligible player, or a player only in a deleted visit is
      rejected.

## Non-goals

- Appointing from crew or trip membership without the person being a player at the table.
- A player asking to become a recorder.
- New roles or permissions beyond recording for everyone.
- Changing who may share the table or appoint (the starter), or who may issue invites.

## Acceptance criteria

- [ ] The starter appoints a player added by name, who shows as pending.
- [ ] That player signs in by any activation path and records for everyone, with `viewerRole`
      `recorder`, without another step from the starter.
- [ ] A signed-out device holding an appointed player records only that player's play, on the
      server and in the app.
- [ ] Revoked bindings and stopped appointments grant nothing.
- [ ] iOS and Android show pending and active recorders, seen in the native app.
- [ ] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, `pnpm test` pass.
