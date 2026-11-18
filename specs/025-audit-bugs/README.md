---
status: in-progress
created: 2026-11-16
priority: high
tags:
  - mobile
  - api
  - bug
created_at: 2026-11-16T21:53:43.726402Z
updated_at: 2026-11-16T22:10:37.138090700Z
transitions:
  - status: in-progress
    at: 2026-11-16T22:10:37.138090700Z
---

# Fix the bugs from the Android audit

## Overview

The Android audit (2026-11-16) found behaviour bugs that aren't about looks. Most live in shared
mobile code or the API, so iOS likely has them too. Each logic, data or navigation fix starts with
a failing test (AGENTS.md); check every fix on iOS as well.

## Bugs

High:

- [ ] **Sign-out crash.**
  - After viewing group Stats, signing out throws "`useStacks` needs a `StacksContext` provider
    above it". The path is `features/GroupStats.tsx:25` through `screens/Stats.tsx:103`, and the
    throw is at `client-runtime/src/react.tsx:42`.
  - The error boundary draws Details and Try again white on white. Give it the app tokens.
- [ ] **Claim renames a member.** Confirming "Yes, I'm Jonah" while already in the group turns the
      member into "Jonah (you)". The API refuses a claim from someone who is already a member of
      that group, and the claim screen says why.
- [ ] **Undo a quick rebuy** leaves the session "buy-in corrected". Undoing from the snackbar
      shows the session as it was before the rebuy, for yourself and for another player.
- [ ] **Navigation after a change:**
  - [ ] Delete trip returns to the group, not a blank screen.
  - [ ] Leave group returns to Crew's root, with no back arrow into the group.
  - [ ] Start trip from a second group opens that group's trip.
- [ ] **A table where everyone cashed out** stops being live. Crew's feed and the trip page show it
      as closed, with the right players.
- [ ] **Finished history:** the count matches the rows, rebuys and corrections have their own
      labels, and the active correction sorts above the voided rows.
- [ ] **Edit my session:** Started edits the date as well as the time. Saving or going back from
      Start time, Buy-in total or Casino returns to Edit my session.
- [ ] **Managing another player:**
  - The menu reads "Edit Priya's session".
  - The sheet title has the possessive.
  - Their history is titled with their name and returns to Edit.

Medium and low:

- [ ] All sessions counts finished sessions only (as Play does since `6a783bb`), and a live row's
      "Live" is green.
- [ ] An active trip with no sessions offers **Start a session**.
- [ ] Form errors sit under the field they belong to and clear as you type (New trip name, New
      group name).
- [ ] Start session:
  - Drops the trip helper text after "Personal · no trip" is picked.
  - Says why "I'm not playing, just recording" is hidden while another session is live.
- [ ] Add past session:
  - Refuses a finish at or before the start.
  - Uses the phone's 12/24-hour setting.
  - Shows the Finished error without waiting for Started.
  - Drops the "Enter a time like 23:45" copy for a field you can't type in.
- [ ] A break-even session shows "$0" and "$0/hr", without a plus sign.
- [ ] Undo cash-out then Back lands on the session once, with one "Back to your session".
- [ ] Two players with the same name can be told apart where they're listed, and a long name doesn't
      push the amount, the title or the result out of view.
- [ ] Stats:
  - Matching sessions rows open their session and have chevrons.
  - A year filter with sessions shows the running-result chart.
  - Scrolling a group doesn't cut the race chart's headline behind the top area.
- [ ] Copy:
  - [ ] "Your buy-in as You." reads naturally.
  - [ ] A share-link landing page shows a live player's state rather than "out $0", and "Open the
        table" is the page's main button.
  - [ ] Edit buy-in's button names what it does ("Add $50", "Set total").
  - [ ] "Alex · you" has its middle dot.
  - [ ] A session's CTA fits.
- [ ] Invite routes share one title, and the invalid-link page uses the app's empty state.
- [ ] The You chip keeps one colour on every screen.

## Non-goals

- Looks that the frames decide (020–022) and the shared Android parts (024).
- Missing features: 026 history grouping, 027 You settings, 028 renaming.
- Changing a group's currency. A group's currency is fixed by design (glossary).

## Test

- [ ] Each fix has a test that failed before it, where the fix is in logic, data or navigation
- [ ] The audit's steps for each bug pass on the Android emulator and the iOS simulator
- [ ] `crew-loop.yaml`, `solo-recording.yaml` and `shared-table.yaml` pass
