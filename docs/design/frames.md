# Design frames

[ColorUp iOS in Figma](https://www.figma.com/design/eAiosYfyYDN9fZQ6miWtJd/ColorUp-iOS) holds the
approved iOS frames, including onboarding, Stats, and the illustrated tab states. The
[Claude Design canvas](https://claude.ai/artifact/TuT3hbPr6ZCyWZcBX4Rjx5) holds the Android frames
and earlier iOS states. When the app and a frame disagree and no spec or
`docs/internals/navigation.md` rule explains it, the applicable design frame wins.

## Reading a frame

- **Names.** The iOS frame is `<Name>`, its Android twin `And<Name>` (six keep older names, see the
  table). Dark variants add `Dark`: `AndStatsDark`. On the canvas each frame's source is
  `project/<file>.dc.html`; read it with the Artifact tool's `read` action and that `path`.
- **Reference images.** The orphan `design-frames` branch holds every frame rendered light and dark,
  at device width: `android/<file>.png` is 1080 px wide (a Pixel 10 at 2.625×), `ios/<file>.png`
  1179 px wide. Raw URL:
  `https://raw.githubusercontent.com/stephencombs/stacks/design-frames/android/AndStats.png`.
  Re-render them when the canvas changes; the canvas wins if they disagree.
- **What a frame fixes.** Layout, hierarchy, copy, type roles, colours and which component is used.
  Sample data (names, amounts, times) is illustrative; the status bar and gesture handle are drawn
  only for orientation.

## Comparing on the Android emulator

1. Run the dev client on a Pixel 10 AVD with the Android 17 QPR2 Play Store image
   (`system-images;android-37.2;google_apis_playstore_ps16k;x86_64`, 16 KB pages, as Google Play
   requires), via `pnpm dev:mobile` then `pnpm exec expo run:android` or an EAS dev build. Default
   font and display size.
2. Reach the state in the table below. Deep links work through `adb shell am start -a
   android.intent.action.VIEW -d "stacks-dev://<path>"` (`stats`, `map`, `crew`, `play/<visitId>`,
   `groups/<groupId>`, `trips/<tripId>`).
3. Screenshot with the T3 device tools (`device_open`, then its `agent-device` command, or
   `device_screenshot`). Switch theme with `adb shell cmd uimode night yes|no` and shoot both.
4. Put the screenshot beside the reference PNG and list every difference in structure, copy,
   component, spacing and colour. Fix them, or record in the spec why one stays.
5. Attach before/after pairs to the PR (see AGENTS.md: images go on `pr-assets/<branch>`).

## Frame index

| Canvas page        | iOS                   | Android                  | App screen                                  | How to reach the state                                                          |
| ------------------ | --------------------- | ------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------- |
| 002 · Tabs         | `Main`                | `AndPlay`                | `screens/Home.tsx`                          | Play tab with finished sessions this month and one live session (LiveBar shows) |
| 002 · Tabs         | `Stats`               | `AndStatsSoon`           | superseded by `StatsTab`                    | —                                                                               |
| 002 · Tabs         | `Map`                 | `AndMapSoon`             | `screens/Map.tsx`                           | Map tab until spec 012 lands                                                    |
| 002 · Tabs         | `Crew`                | `AndGroups`              | `screens/Crew.tsx` (your groups)            | Crew › Groups                                                                   |
| 002 · Tabs         | `Trip`                | `AndTrip`                | `screens/Sessions.tsx`                      | `trips/<tripId>`                                                                |
| 003 · Live session | `Live`                | `AndLive`                | `screens/Play.tsx`                          | `play/<visitId>` right after a rebuy (snackbar)                                 |
| 003                | `LiveMenu`            | `AndMenu`                | `Play.tsx` ⋮ menu                           | open ⋮                                                                          |
| 003                | `Rebuy`               | `AndRebuy`               | `RecordingForms.tsx` rebuy sheet            | Rebuy › Other, type 150                                                         |
| 003                | `LiveEdit`            | `AndLiveEdit`            | edit sheet                                  | ⋮ › Edit my session                                                             |
| 003                | `DeleteSession`       | `AndDeleteSession`       | delete confirmation                         | Edit › Delete session                                                           |
| 003                | `BuyIn`               | `AndBuyIn`               | buy-in total sheet                          | Edit › Buy-in total › Set total 250                                             |
| 003                | `CashOut`             | `AndCashOut`             | cash-out sheet                              | Cash out, type 350                                                              |
| 003                | `Finished`            | `AndFinished`            | `Play.tsx` finished                         | end a session                                                                   |
| 003                | `LiveActivity`        | `AndLiveUpdate`          | Live Update notification                    | spec 023                                                                        |
| 003                | `IslandCompact`       | `AndStatusChip`          | status-bar chip                             | spec 023                                                                        |
| 003                | `IslandExpanded`      | `AndShadeUpdate`         | notification shade                          | spec 023                                                                        |
| 003                | `LockRebuy`           | `AndLockRebuy`           | notification after a rebuy                  | spec 023 (later)                                                                |
| 003                | `LockCashOut`         | `AndLockCashOut`         | cash-out sheet opened from the notification | spec 023                                                                        |
| 003                | `LockDone`            | `AndLockDone`            | finished notification                       | spec 023                                                                        |
| 003                | `MpStarter`           | `AndMpStarter`           | shared table, you playing                   | start a session, add players                                                    |
| 003                | `MpStarterMenu`       | `AndMpStarterMenu`       | ⋮ menu at a shared table                    | open ⋮                                                                          |
| 003                | `MpJoiner`            | `AndMpJoiner`            | joined someone else's table                 | `t/<token>` and sit down                                                        |
| 003                | `MpJoinerEdit`        | `AndMpJoinerEdit`        | joiner's edit sheet                         | pencil                                                                          |
| 003                | `MpRecorder`          | `AndMpRecorder`          | recording a table you don't play            | start a table without sitting down                                              |
| 003                | `MpAddPlayer`         | `AndMpAddPlayer`         | add player sheet                            | person-add                                                                      |
| 003                | `MpRebuyPriya`        | `AndMpRebuyPriya`        | rebuy for another player                    | tap a player › rebuy                                                            |
| 003                | `MpCashOutPriya`      | `AndMpCashOutPriya`      | cash out another player                     | tap a player › cash out                                                         |
| 003                | `MpStarterOut`        | `AndMpStarterOut`        | you cashed out, table still live            | cash yourself out                                                               |
| 005 · Stats        | `StatsTab`            | `AndStats`               | `screens/Stats.tsx`                         | `stats`, Just me, all time                                                      |
| 005                | `StMPeriodMenu`       | `AndStMPeriodMenu`       | period menu                                 | tap All time                                                                    |
| 005                | `StMTripSheet`        | `AndStMTripSheet`        | trip sheet                                  | tap All trips                                                                   |
| 005                | `StMTrip`             | `AndStMTrip`             | a trip picked                               | pick a trip                                                                     |
| 005                | `StMDrilled`          | `AndStMDrilled`          | a casino picked                             | tap a casino row                                                                |
| 005                | `StMScrub`            | `AndStMScrub`            | chart inspect                               | drag the chart                                                                  |
| 005                | `StMCasinos`          | `AndStMCasinos`          | all casinos sheet                           | By casino › See all                                                             |
| 005                | `StMLosingYear`       | `AndStMLosingYear`       | a losing period                             | pick a losing year                                                              |
| 005                | `StMEmpty`            | `AndStMEmpty`            | no finished sessions                        | fresh install                                                                   |
| 005                | `StMNoMatch`          | `AndStMNoMatch`          | filters match nothing                       | combine filters                                                                 |
| 005                | `StGGroupMenu`        | `AndStGGroupMenu`        | group menu                                  | tap Just me                                                                     |
| 005                | `StGGroup`            | `AndStGGroup`            | a group's stats                             | pick a group                                                                    |
| 005                | `StGGroupLower`       | `AndStGGroupLower`       | scrolled                                    | scroll                                                                          |
| 005                | `StGGroupTrip`        | `AndStGGroupTrip`        | a group trip                                | pick a trip                                                                     |
| 005                | `StGGroupTripLower`   | `AndStGGroupTripLower`   | trip, scrolled to awards                    | scroll                                                                          |
| 005                | `StGGroupTrips`       | `AndStGGroupTrips`       | group trip sheet                            | tap All trips                                                                   |
| 005                | `StGMember`           | `AndStGMember`           | member stat sheet                           | tap a standing                                                                  |
| 005                | `StGGroupOffline`     | `AndStGGroupOffline`     | offline, cached                             | airplane mode after a load                                                      |
| 005                | `StGGroupUnavailable` | `AndStGGroupUnavailable` | offline, never loaded                       | airplane mode, new group                                                        |
| 005                | `StGGroupEmpty`       | `AndStGGroupEmpty`       | group with no sessions                      | new group                                                                       |
| 005                | `StGGroupNoMatch`     | `AndStGGroupNoMatch`     | group filters match nothing                 | combine filters                                                                 |
| 005 · Map          | `MapTab`              | `AndMapTab`              | `screens/Map.tsx`                           | spec 012                                                                        |
| 005 · Map          | `MapVenue`            | `AndMapVenue`            | venue sheet                                 | spec 012                                                                        |
| 006 · Crew         | `CrewFeed`            | `AndCrew`                | `screens/Crew.tsx`                          | `crew` with a live trip                                                         |
| 006 · Crew         | `GroupPage`           | `AndGroupPage`           | `screens/Group.tsx`                         | `groups/<groupId>`                                                              |

## Where Android differs from iOS on purpose

These follow Material 3 Expressive. Don't copy the iOS treatment over them.

- A dialog, not a sheet, confirms a delete.
- Extended FABs carry the main action on Groups ("New group") and a trip ("Start a session").
- Filter chips are outlined with 8dp corners until applied; an applied chip is ink with a clear ✕.
- Single-choice lists in sheets use radio buttons; menus are dropdowns anchored to their chip.
- Buy-in mode is a connected button group; dates and times are chips that open the Material pickers.
- Snackbars have 4dp corners; the chart reading is a rich tooltip; the map's venue sheet is a
  standard (non-modal) sheet.
- Live play outside the app is a Live Update notification and status-bar chip, not a Live Activity.
