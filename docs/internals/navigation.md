# Navigation

Color Up has four tabs and a You sheet. Each tab answers one question:

| Tab       | Question                          | Holds                                                                            |
| --------- | --------------------------------- | -------------------------------------------------------------------------------- |
| **Play**  | Am I playing, and how's it going? | This month's result, the live session or Start session, recent sessions, history |
| **Stats** | How do I do, broken down?         | Result, hours, hourly, win rate, filtered by time, game, venue and trip          |
| **Map**   | Where have I played?              | Venues as pins colored by result, and a day or trip drawn as a path between them |
| **Crew**  | What are my friends doing?        | Activity from your groups, newest first, with the current trip pinned on top     |

**You** opens from the avatar on every tab: account, recording defaults, display (cents, privacy mode, theme) and export. It is a sheet, not a tab, because nobody opens the app to change a setting.

Mobile draws the tabs as native tabs on iOS and the platform destination bar on Android. Web draws them as a bottom bar below `lg` and a left sidebar above it. The tabs and their names are the same everywhere.

## Play

Play is `/` on web and the first tab on mobile. It works with no account, group, trip or network: it never waits for sign-in, and sign-in failing or not being configured leaves it working. Personal addresses carry no query string, because the offline web shell only serves queryless navigations.

The `+` button offers **Start live session** and **Add past session**. Recent sessions link to **All sessions** at `/history`, grouped by month (`/history/2026-11`) or year (`/history/2026`), each group headed by its result, hours and session count.

A personal session lives at `/play/:visitId`. While it's live it fills the screen: elapsed time, buy-in total, game and venue, a row of rebuy amounts with undo, **Edit** and **Cash out**. Edit opens one sheet per field (buy-in, start time, game, venue); the buy-in sheet adds, subtracts or sets the total. Cashing out takes the amount and end time and finishes the visit with no further choice. A finished session shows its result, duration, hourly, the venue on a map and the others at the table.

While a session is live, a LiveBar floats above the tabs on every screen except the session itself, and tapping it returns there.

## Shared tables

A personal session is one player's visit to a table. Its page lists everyone at the table, and whoever started the table adds players (someone new by name, or a player saved on this device) and records for each of them on that player's own `/play/:visitId`. There is no separate table page to record from: a table is reached through any visit at it. The table closes once every player at it has cashed out.

The starter's Share sheet makes a link, `/t/:token`, which opens on the web with no account and shows that one table and nothing else. The same page offers **Join this table**. It asks only for a name and always creates a new player on this device, so a link can never be used to record as someone already there. Joining needs the network once; everything after it records offline on the joiner's own `/play/:visitId`. A participant's controls act only on their own visits; the starter's act on everyone's. When a visit finishes, **Back at the table** starts a new visit for the same player at the same table. Revoking the link stops new joins. Mobile sends the web address, since the link must work for people without the app, and has no `/t/:token` deep link yet.

To record as a player already at the table, the starter opens **Table settings** and picks **Invite this player**. The link, `/invite/:token`, opens on the web, says whose play it records and works once. Table settings is the starter's alone: it also lists and stops the devices recording as each player, appoints **Recorders** (account holders who record for everyone) and holds **Stop sharing**. A recorder never sees Share or Table settings.

## Crew

Crew needs an account. It opens on activity from every group you're in: who is playing where right now, sessions that finished, trips that started. Each row opens that session or trip. It is private to your groups; there are no likes, comments or profiles of strangers, because a player's identity must never become a way to discover their sessions.

The current trip is pinned above the list, showing who's live and the top of its board. A trip, `/trips/:id`, holds its sessions and its board (`/trips/:id/board`, This trip | All time). A group, `/groups/:id`, holds its trips and people, and its settings at `/groups/:id/settings`.

## Why it changed

The previous design treated group and trip as a scope chosen at the top of every screen, with Sessions, Board and Group as tabs inside that scope, and personal play outside any tabs. That put the thing people do most, recording their own play, outside the app's main structure, and spent the tab bar on one trip at a time. The current design follows single-player trackers such as CasinoIQ (play, stats, map, feed): personal play is the app, and friends are one tab of it, shown as activity instead of a scope you have to switch.

## Rules

1. **Every screen says where you are.** A title is always visible, and the back slot only ever goes back.
2. **One row of peer navigation per screen.** A segmented control may change the scope or measure of the same data (`By month | By year`, `This trip | All time`). It may not switch to different content; that's a link.
3. **One home per thing.** If two screens need the same chart or list, one links to the other.
4. **Tabs are not actions.** Starting a session, a new trip and invites are buttons inside tabs.
5. **Same tabs on every surface.** Web and mobile differ in their container, never in their destinations or names.

## Addresses

`/` (Play), `/history`, `/history/:year`, `/history/:year-:month`, `/play/:visitId`, `/stats`, `/map`, `/crew`, `/t/:token` and `/invite/:token` (web only), `/trips/:id`, `/trips/:id/board`, `/sessions/:id` (a group's shared table), `/groups/:id`, `/groups/:id/settings`. Stats and Map keep their filters in screen state, not the address, so they work offline. Old addresses keep working: `/groups` goes to Crew, a trip's `/results` to its board, a group's `/stats` to its board's All time and `/groups/:id/people` to the group.
