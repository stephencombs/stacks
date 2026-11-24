# Navigation

Color Up has four tabs and a You sheet. Each tab answers one question:

| Tab       | Question                          | Holds                                                                            |
| --------- | --------------------------------- | -------------------------------------------------------------------------------- |
| **Play**  | Am I playing, and how's it going? | This month's result, Start session, recent sessions, history                     |
| **Stats** | How do I do, broken down?         | Result, hours, hourly, win rate by time, game, venue and trip; a group's stats   |
| **Map**   | Where have I played?              | Venues as pins colored by result, and a day or trip drawn as a path between them |
| **Crew**  | What are my friends doing?        | Activity from your groups, newest first, with the current trip pinned on top     |

**You** opens from the avatar on every tab: account, recording defaults, display (cents, privacy mode, theme) and export. It is a sheet, not a tab, because nobody opens the app to change a setting.

iOS uses native bottom tabs and Android uses the platform destination bar. Both have the same destinations and names.

## Play

Play is `/` on web and the first tab on mobile. It works with no account, group, trip or network: it never waits for sign-in, and sign-in failing or not being configured leaves it working. Personal addresses carry no query string, because the offline web shell only serves queryless navigations.

The `+` button offers **Start live session** and **Add past session**. Starting can also record a table you aren't playing at, which opens the table instead of a session. Recent sessions link to **All sessions** at `/history`, grouped by month (`/history/2026-11`) or year (`/history/2026`), each group headed by its result, hours and session count.

A personal session lives at `/play/:visitId`. While it's live it fills the screen in felt: the amount bought in is the big number, the elapsed time sits in a LIVE pill at the top, and three rebuy buttons sit above **Cash out**. A rebuy shows an undo toast. The top-right slot holds what you can do: nothing, one button such as Edit, or a ⋯ menu when there are several. It never names a role: whoever started the table gets Edit my session, Add player, Share table and Table settings; a recorder gets Add player; a player who joined gets Edit alone. Edit opens one sheet per field (buy-in, start time, game, venue) and **Delete session**; the buy-in sheet adds, subtracts or sets the total. Cashing out takes the amount and end time and finishes the visit with no further choice. A finished session shows its result, duration, hourly and the others at the table, with **Undo cash-out** and **Back at the table**. On your own finished session the top-right slot is a ⋯ menu with Edit and **Share card**, an image of the session for the share sheet; live sessions and other players' visits get no card.

Deleting asks first, then voids every entry of your visit and hides it, with an undo. It works on your own visits, live or finished; on a shared table it removes only your visit.

While a session is live, or a table you record for everyone at has players and none of them is you, one LiveBar floats above the tabs, and tapping it returns there. On Play it floats above the tabs, under the `+` button. On iOS 26 it is the tab bar's own accessory instead, on every tab: above the tab bar, and inline beside it once scrolling minimizes the bar. With several live sessions, such as one you record for a second player, the bar names the newest with "+1 live" and opens a list to pick from. A session's own page shows the bar above its dock only when another session is live, and then it refers to the others. A live session never shows as a list on a tab.

## Shared tables

A personal session is one player's visit to a table. Its live page lists everyone at the table under your own session, playing first and cashed out faded. Whoever started the table, and any recorder they appointed, adds players (someone new by name, or a player saved on this device) and taps a player's row to rebuy or cash them out, or to undo a cash-out. The table closes once every player at it has cashed out.

A table has its own page, `/tables/:tableId`, for whoever records there without a visit in play: someone who started a table without playing, a recorder who never sits down, or a starter who cashed out while others play (cashing out takes them there). It leads with what's in play at the table, lists everyone, and offers **Sit down and play**. Everyone else reaches a table through their visit at it. A table nobody has played at can be deleted from its page.

The starter's Share sheet makes a link, `/t/:token`, which opens in the app with no account and shows that one table and nothing else. The same page offers **Join this table**. It asks only for a name and always creates a new player on this device, so a link can never be used to record as someone already there. Joining needs the network once; everything after it records offline on the joiner's own `/play/:visitId`. A participant's controls act only on their own visits; the starter's act on everyone's. When a visit finishes, **Back at the table** starts a new visit for the same player at the same table. Revoking the link stops new joins. Where the build has a link host, the app shares it as an https link with the token in the fragment (`https://<host>/t#<token>`). Universal links and App Links open it in the app when Color Up is installed, and a static page says how to get the app when it isn't; the fragment never reaches the server, so no log or preview sees a token. Without a host, and in dev builds, it shares the scheme form (`stacks://t/:token`). Each build has its own host, so a production and a preview build installed together never open each other's links. Scheme links already sent keep working.

Group play is recorded the same way. Signed in, starting a session can put the table in one of your groups' trips, and a trip page's **Start a session** does so for you. The whole table belongs to that trip: its players' visits, return visits included, show in the trip, the group's stats and Crew, and nothing else of theirs does. The older group session screens retire once their sessions move to tables.

To record as a player already at the table, the starter opens **Table settings** and picks **Invite this player**. The link, `/invite/:token`, opens in the app, says whose play it records and works once. Table settings is the starter's alone: it also lists and stops the devices recording as each player, appoints **Recorders** (account holders who record for everyone) and holds **Stop sharing**. A recorder never sees Share or Table settings.

## Stats

Stats opens on **Just me**: your result and its running line, then money, results by month (or by night, for one trip), patterns, records, and results by game and casino, from every session you've recorded, filtered by period, game, casino and trip. Stats lists no sessions: Play's history owns that, and a record opens its session there. It reads the device's recording store, so it works signed out and offline. The filters are chips that live in screen state.

Signed in, a **Group** chip switches the same page to that group's stats: the group's result by trip, then standings, what the crew did together, its trips, habits, records, and results by game and casino. Each member's row opens their stat sheet, a trip's row or bar applies the trip chip, and nothing opens a single play: plays carry no kind or visit to open. Group numbers count only sessions recorded in that group, never anyone's device-only play. With a group picked, the trip chip lists that group's trips, so one trip's stats are the group and trip chips together. With a trip picked, the result by trip becomes By night and the Trips section gives way to that trip's awards. Offline, the group view shows the last copy it fetched and says when. A trip has no stats page of its own: its **Stats** button, and Crew's pinned trip, open Stats with the group and trip already picked, carried in navigation state rather than the address.

Group stats live in Stats, not on the trip, so a group's numbers and yours read the same way and share one set of filters, instead of a second stats screen inside Crew.

## Crew

Crew needs an account. It opens on activity from every group you're in: who is playing where right now, sessions that finished, trips that started. Each row opens that session or trip. It is private to your groups; there are no likes, comments or profiles of strangers, because a player's identity must never become a way to discover their sessions.

The current trip is pinned above the list, showing who's live and the top of its standings. Your own live play stays out of the feed and appears in Play's LiveBar. **Groups** opens a page on Android and a sheet on iOS. Each group lists its people and what it has going. A trip, `/trips/:id`, holds its tables and a **Stats** button; its options menu has **Share card** once a session has finished, an image of the standings. A group, `/groups/:id`, holds its trips and people and a **Stats** button, and its settings at `/groups/:id/settings`.

## Why it changed

The previous design treated group and trip as a scope chosen at the top of every screen, with Sessions, Board and Group as tabs inside that scope, and personal play outside any tabs. That put the thing people do most, recording their own play, outside the app's main structure, and spent the tab bar on one trip at a time. The current design follows single-player trackers such as CasinoIQ (play, stats, map, feed): personal play is the app, and friends are one tab of it, shown as activity instead of a scope you have to switch.

## Rules

1. **Every screen says where you are.** On a tab's first screen the selected tab says it, so there is no large title; a pushed screen shows its title. The back slot only ever goes back.
2. **One row of peer navigation per screen.** A segmented control may change the scope or measure of the same data (`By month | By year`). It may not switch to different content; that's a link.
3. **One home per thing.** If two screens need the same chart or list, one links to the other.
4. **Tabs are not actions.** Starting a session, a new trip and invites are buttons inside tabs.
5. **Same tabs on every surface.** iOS and Android differ in their container, never in their destinations or names.

## Addresses

`/` (Play), `/history`, `/history/:year`, `/history/:year-:month`, `/play/:visitId`, `/tables/:tableId`, `/stats`, `/map`, `/crew`, `/t/:token`, `/invite/:token`, `/join/:code` and `/claim/:code` (the paths of the scheme links; https links carry the token as `/t#token`, and the app reads either), `/trips/:id`, `/sessions/:id` (a group's older shared table, until it moves to a table), `/groups/:id`, `/groups/:id/settings`. Stats and Map keep their filters in screen state, not the address, so they work offline. Old addresses keep working: `/groups` goes to Crew, a trip's `/board` and `/results` to Stats with that group and trip picked, a group's `/stats` to Stats with that group picked, and `/groups/:id/people` to the group.
