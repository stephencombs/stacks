# Navigation

Color Up keeps one trip in focus. The group and trip you're in are context, shown as a labeled
scope button at the top of every screen. Under it, four places answer the questions people open
the app with:

| Place         | Question                     | Holds                                                                     |
| ------------- | ---------------------------- | ------------------------------------------------------------------------- |
| **Sessions**  | What's being played?         | The live session first, the trip card, then sessions by day               |
| **Board**     | Who's winning?               | Race chart and standings, scoped to _This trip_ or _All time_             |
| **Settle up** | Who owes whom?               | Suggested payments, balances, backing, payment history                    |
| **Group**     | Who's in it, and what trips? | Trips, People (members, guests, invites), Settings (payment apps, export) |

Anything that's only about you (play limits, appearance, account, sign out) sits behind your
avatar, in **You**, on every screen. Phones and narrow web windows draw the four places as a bottom
bar; wide web windows draw them as a left sidebar. The places are the same on both.

## Why this shape

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

1. **Every screen says where you are.** The scope button and a page title are always visible.
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
the group's live or most recent trip. The last trip in scope is remembered per device, and opening
the app lands on its Sessions.

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

Web and mobile share addresses: `/trips/:id` (Sessions), `/trips/:id/board` (`?scope=all` for All
time), `/trips/:id/settle`, `/sessions/:id`, `/groups/:id` (the hub), `/groups/:id/people` and
`/groups/:id/settings`. Old addresses keep working: a trip's `/results` goes to its Board and a
group's `/stats` to the Board's All time. A group's `/settings` used to mix people and settings; it
now opens Settings, which links to People.
