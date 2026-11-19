---
status: in-progress
created: 2026-11-16
priority: high
tags:
  - mobile
  - api
  - bug
created_at: 2026-11-16T21:53:43.726402Z
updated_at: 2026-11-19T06:09:01.932258800Z
transitions:
  - status: in-progress
    at: 2026-11-16T22:10:37.138090700Z
---

# Fix the bugs from the Android audit

## Overview

The Android audit (2026-11-16) found behaviour bugs that aren't about looks. Most live in shared
mobile code or the API, so iOS likely has them too. Each logic, data or navigation fix starts with
a failing test (AGENTS.md).

## Bugs

High:

- [x] **Sign-out crash.**
  - After viewing group Stats, signing out throws "`useStacks` needs a `StacksContext` provider
    above it". The path is `features/GroupStats.tsx:25` through `screens/Stats.tsx:103`, and the
    throw is at `client-runtime/src/react.tsx:42`.
  - The error boundary draws Details and Try again white on white. Give it the app tokens.
- [x] **Claim renames a member.** Confirming "Yes, I'm Jonah" while already in the group turns the
      member into "Jonah (you)". The API refuses a claim from someone who is already a member of
      that group, and the claim screen says why.
- [x] **Undo a quick rebuy** leaves the session "buy-in corrected". Undoing from the snackbar
      shows the session as it was before the rebuy, for yourself and for another player.
- [x] **Navigation after a change:**
  - [x] Delete trip returns to the group, not a blank screen.
  - [x] Leave group returns to Crew's root, with no back arrow into the group.
  - [x] Start trip from a second group opens that group's trip.
- [x] **A table where everyone cashed out** stops being live. Crew's feed and the trip page show it
      as closed, with the right players.
- [x] **Finished history:** the count matches the rows, rebuys and corrections have their own
      labels, and the active correction sorts above the voided rows.
- [x] **Edit my session:** Started edits the date as well as the time. Saving or going back from
      Start time, Buy-in total or Casino returns to Edit my session.
- [x] **Managing another player:**
  - The menu reads "Edit Priya's session".
  - The sheet title has the possessive.
  - Their history is titled with their name and returns to Edit.

Medium and low:

- [x] All sessions counts finished sessions only (as Play does since `6a783bb`), and a live row's
      "Live" is green.
- [x] An active trip with no sessions offers **Start a session**.
- [x] Form errors sit under the field they belong to and clear as you type (New trip name, New
      group name).
- [x] Start session:
  - [x] Drops the trip helper text after "Personal · no trip" is picked.
  - [x] Says why "I'm not playing, just recording" is hidden while another session is live.
- [x] Add past session:
  - Refuses a finish at or before the start.
  - Uses the phone's 12/24-hour setting.
  - Shows the Finished error without waiting for Started.
  - Drops the "Enter a time like 23:45" copy for a field you can't type in.
- [x] A break-even session shows "$0" and "$0/hr", without a plus sign.
- [x] Undo cash-out then Back lands on the session once, with one "Back to your session".
- [x] Two players with the same name can be told apart where they're listed, and a long name doesn't
      push the amount, the title or the result out of view.
- [ ] Stats:
  - [x] Matching sessions rows open their session and have chevrons.
  - [x] A year filter with sessions shows the running-result chart.
  - [ ] Scrolling a group doesn't cut the race chart's headline behind the top area.
- [x] Copy:
  - [x] "Your buy-in as You." reads naturally.
  - [x] A share-link landing page shows a live player's state rather than "out $0", and "Open the
        table" is the page's main button.
  - [x] Edit buy-in's button names what it does ("Add $50", "Set total").
  - [x] "Alex · you" has its middle dot.
  - [x] A session's CTA fits.
- [x] Invite routes share one title, and the invalid-link page uses the app's empty state.
- [x] The You chip keeps one colour on every screen.

## Non-goals

- Looks that the frames decide (020–022) and the shared Android parts (024).
- Missing features: 026 history grouping, 027 You settings, 028 renaming.
- Changing a group's currency. A group's currency is fixed by design (glossary).

## Test

- [ ] Each fix has a test that failed before it, where the fix is in logic, data or navigation
- [ ] The audit's steps for each bug pass on the Android emulator
- [x] `crew-loop.yaml`, `solo-recording.yaml` and `shared-table.yaml` pass

iOS verification was waived. PR [#110](https://github.com/stephencombs/stacks/pull/110)
contains the merged fixes. On the Pixel 10, undoing another player's quick rebuy restored the
original total and buy-in count. The Add past session form showed both missing time errors on
submit. The selected year showed a running-result chart and a matching Stats row opened the
finished visit. Another player's history showed their name and returned to Edit on close, and
Started offered separate date and time controls. The solo, shared-table and Crew Maestro flows passed
on Android. The shared-table run caught a race during device key creation. Concurrent requests now
use the same key. Crew verified deleting a trip, leaving a group, starting a trip in a second group,
and signing out from group Stats. With the current API and an isolated Postgres database, Crew
also verified that an existing member opening a guest's claim link sees the explanation and has
no claim action. An Android run verified that correcting a $300 buy-in total to $250 returned
to Edit, and cashing out $250 showed $0, $0/hr, and a Corrected buy-in history row.
Android also verified the recorder-only explanation during a live session and the two missing-time
errors in Add past session. Earlier and equal same-day finishes now fail validation. Players
recording an overnight session can select Finished the next day.
The group table API test verifies that all three players appear with the right results after
the last cash-out and the table clears from both live counts. All sessions on Android showed one
finished session in its count alongside a separate green Live row.
The Android group invite run verified that empty group and trip names show field errors
and that each error clears as soon as the user types. A fresh install redeemed a personal
invite and saw the invalid-invite empty state when it opened the same link again.
On Android, choosing Personal · no trip removed the trip helper and both Crew and Stats
showed the same You chip. The group race headline and chart were visible together.
Starting time, buy-in total and casino all returned to Edit on save and on Back.
Android showed Priya and Priya 2 with different buy-ins. The long-name row and player sheet kept
the amount and cash-out action visible while shortening the displayed name.
The share link showed the remaining live player's buy-in and offered Open the table after the
starter cashed out. A new player named You saw Your buy-in.
