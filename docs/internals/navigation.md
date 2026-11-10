# Navigation

Color Up opens on **your play**: `/` on web and the first screen on mobile. It lists sessions in
play first, then finished ones with their results, and offers Start session and Add past session.
A personal session lives at `/play/:visitId` (mobile `play/:visitId`), with Rebuy and Cash out
while it's live. Both are on this device and need no account, group, trip or network: they never
wait for sign-in, and sign-in failing or not being configured leaves them working.

A personal session is one player's visit to a table. Its page lists everyone at the table, and
whoever started the table adds players (someone new by name, or a player saved on this device) and
records for each of them on that player's own `/play/:visitId`. There is no separate table page to
record from: a table is reached through any visit at it. The starter's Share sheet makes a link,
`/t/:token`, which opens on the web with no account and shows that one table and nothing else.

The same page offers **Join this table**. It asks only for a name and always creates a new player
on this device, so a link can never be used to record as someone already there. Joining needs the
network once; the buy-in that follows, and everything after it, records offline on the joiner's
own `/play/:visitId`, which lists "You" plus the others (fetched from the server, so only online).
A participant's controls act only on their own visits; the starter's act on everyone's. When a
visit finishes, **Back at the table** starts a new visit for the same player at the same table.
Revoking the link stops new joins; people who joined keep their table through their play.
Mobile sends the web address, since the link must work for people without the app, and has no
`/t/:token` deep link yet: joining happens on the web, and mobile shows joined tables it syncs.

A table link only ever makes a new player. To record as a player already at the table (someone
the starter added by name, or the same guest on a second phone), the starter opens **Table
settings** from the table and picks **Invite this player**, or a device already recording as that
player makes one from its own table. The link, `/invite/:token`, opens on the web, says whose play
it records and works once; taking it up binds this device to that player, who then records only
their own play. The same sheet lists the devices recording as the player and stops any of them.
Table settings is the starter's alone: it also appoints **Recorders**, players with an account who
record for everyone (and, like the starter, see the whole table on their device), and holds
**Stop sharing**. A recorder never sees Share or Table settings.

Groups and trips are a second, account-backed area, reached from **Groups** in the header. Inside
it, the group and trip you're in are context, shown as a labeled scope button at the top of every
screen. Under it, four places answer the questions people open a trip with:

| Place         | Question                     | Holds                                                                     |
| ------------- | ---------------------------- | ------------------------------------------------------------------------- |
| **Sessions**  | What's being played?         | The live session first, the trip card, then sessions by day               |
| **Board**     | Who's winning?               | Race chart and standings, scoped to _This trip_ or _All time_             |
| **Settle up** | Who owes whom?               | Suggested payments, balances, backing, payment history                    |
| **Group**     | Who's in it, and what trips? | Trips, People (members, guests, invites), Settings (payment apps, export) |

Anything that's only about you (play limits, appearance, account, sign out) sits behind **You**.
Phones and narrow web windows draw the four places as a bottom bar; wide web windows draw them as
a left sidebar. The places are the same on both. The wordmark goes back to your play.

## Why your play comes first

Recording your own session is the job people open the app for, and it can't depend on anything
that may be missing at a casino table: a signal, a working sign-in, or a group someone else set
up. Groups and trips stay one tap away rather than being the way in. Personal addresses carry no
query string, because the offline web shell only serves queryless navigations.

Personal sessions are a different record from a group's `/sessions/:id`: that address names a
whole shared table, so it keeps resolving its original record and is never read as a visit.

## Why groups use scope

Almost everyone belongs to one group and plays one trip at a time, and both change every few
months. Earlier versions gave the group and the trip a row of tabs each, styled alike, and put the
only route between them in the back slot of the header. People couldn't tell which level they were
on, and the group's pages were effectively hidden. Treating group and trip as _scope_ rather than
destinations removes a level, and leaves the tabs for the questions that recur within a trip.

The model borrows from shared-expense ledgers (Splitwise and Tricount keep the log and the money
apart), sports trackers built around a live activity (Strava's You tab, 18Birdies' shared
scorecard), and the platform guidance that tab bars hold peer places, never actions
([Apple HIG](https://developer.apple.com/design/human-interface-guidelines/tab-bars),
[Material adaptive navigation](https://developer.android.com/develop/ui/compose/layouts/adaptive/build-adaptive-navigation)).

## Rules

1. **Every screen says where you are.** A page title is always visible, and inside groups and
   trips so is the scope button.
   Nothing is reachable only through an unlabeled menu, and the back slot only ever goes back.
2. **One row of navigation per screen.** A segmented control inside a place may change the scope
   of the same data (This trip / All time). It may not switch to different content; that's a new
   place or a link.
3. **One home per thing.** If two screens need the same chart or list, one of them links to the
   other.
4. **File things by whose they are.** Yours goes in You, the group's in Group, this trip's in its
   places.
5. **Places are not actions.** Start a session, New trip and Invite are buttons inside places.
6. **Same places on every surface.** Web and mobile differ in their container, never in their
   destinations or their names.

## Scope

The scope is a trip, and its group comes with it. A page that names a trip or a session sets the
scope to that trip. A group page keeps the scope if it's already in that group; otherwise it picks
the group's live or most recent trip. The last trip in scope is remembered per device.

A group with no trips has nothing for Sessions, Board or Settle up to show, so only Group is
offered until the first trip starts.

The scope sheet lists the group's trips (live and unended first), offers New trip, links to the
group, and lists your other groups only when you have some.

## The live session

A running session is the one thing that outranks the current place. While you're in one, the
LiveBar floats above the navigation on every screen except two: the session itself, and Sessions,
where the live card is already first. On wide web windows the sidebar carries it instead.

The session page is pushed onto Sessions with a real back button, and the places stay visible, so
the Board is one tap away mid-session.

## Addresses

Web and mobile share addresses: `/` (your play), `/play/:visitId` (a personal session), `/t/:token`
(a shared table, web only), `/invite/:token` (a personal invite, web only),
`/groups` (your groups), `/trips/:id` (Sessions), `/trips/:id/board` (`?scope=all` for All
time), `/trips/:id/settle`, `/sessions/:id`, `/groups/:id` (the hub), `/groups/:id/people` and
`/groups/:id/settings`. Old addresses keep working: a trip's `/results` goes to its Board and a
group's `/stats` to the Board's All time. A group's `/settings` used to mix people and settings; it
now opens Settings, which links to People.
