# Color Up product scope

Color Up records casino play for an individual player first. A player can start a session without signing in, choosing a Trip or joining a Group. Shared tables, Trips and Groups organize that same play and financial history.

This baseline was agreed in the product interview on 6 November 2026. It describes the target behavior. The existing implementation still uses a Group- and Trip-bound ledger and must migrate without losing history.

## Recording and reviewing play

A personal session is one player's visit to one table: buy in, play with any rebuys, then finish. Moving tables or returning after finishing starts another personal session, even at the same venue and game. Carrying $450 between tables records $450 out of the first and $450 into the second.

A shared table view brings players' personal sessions together. If a player finishes, leaves and returns while friends continue, their return is a new session in their history. Their friends keep recording uninterrupted in the same shared view. There is no table-number field.

Starting your own live session requires only an initial buy-in. Start time defaults to now. Game and venue can be added immediately or later. Seat tracking and high-limit tracking are optional. USD is the only currency initially.

Partial cash-outs do not end play. Recording a cash-out offers "Keep playing" or "Finish playing." Finishing ends that player's participation, while other players may continue. A zero cash-out records finishing with nothing returned. Mistaken completion must be reversible without treating a genuine return visit as the same session.

During play, show total in and total out with final win/loss pending. After finishing, the result is cash-outs plus result adjustments minus buy-ins. Do not present an initial buy-in as a finalized loss. Do not track chip inventories, chip-count snapshots or cash-versus-chips holdings; entries record dollar amounts.

Support recording live and adding completed sessions afterward. A completed session can use total buy-ins and cash-outs without reconstructing every rebuy.

Recording works offline. Buy-ins, cash-outs and corrections save on the device immediately, survive relaunch, and show their sync state. Shared changes sync when connectivity returns. Server rejections remain visible and recoverable rather than silently discarding recorded activity.

The personal home screen prioritizes recording and review. During play, the active session and its recording actions come first. Between sessions, "Start session" comes first, followed by recent sessions and personal results. Balances, Trips and Groups remain easy to reach and secondary.

History supports breakdowns over time, by game, venue, high-limit status and blackjack seat. Seat changes stay within a session and retain their history. Only sessions played entirely in one known seat contribute to that seat's result comparisons. Sessions with changes appear as "Multiple seats"; do not assign their whole result to the longest-held seat.

## Players, accounts and guests

A player has a persistent identity independent of accounts, Groups and Trips. A display name is a label, not proof of identity. In later sessions, explicitly choose a saved player or create a different person. Never combine players merely because their names match.

Recording sessions, sharing a table directly and joining as a guest do not require sign-in. Guests can access their own player record through a personal invite and contribute only their own data. An ordinary invitation must not let someone impersonate another player at the table.

Signing up preserves the existing identity and history and adds account backup and sync. Claiming history does not copy financial entries into a second history. Separately created guest identities stay separate until ownership of both is verified and they are explicitly linked.

Creating a Group or shared Trip requires an account so it has a recoverable owner. Private Trips can remain on the device without an account. An appointed recorder must have an account; the person who starts recording does not need one.

## Sharing and permissions

Shared table participants can see the whole table's entries and results. Ordinary participants can record and correct only their own play. The person who started the table recording can record and correct for everyone, including after guests join.

The starter can appoint account-holding players to record and correct for everyone and can revoke that permission. Appointed recorders do not gain authority to share the table. Only the starter controls table sharing. A player leaving and returning does not transfer that authority.

Adding a table to a shared Trip or Group exposes its whole-table entries and results to members. It does not expose unrelated sessions, debts or personal history. Sharing grants visibility; permissions to record for other players remain separately assigned.

Removing a shared table revokes access for people whose only access came through that collection. Direct participants and people with another valid access path retain access. Visibility changes preserve the underlying records and financial obligations. Moving covered play out of a backed Trip is a financial correction, described below.

The API enforces permissions. Hiding a client control is not authorization. Global player identities must not become a way to discover private sessions or balances.

## Financial records and balances

Results describe play. Balances describe what one player owes another. Covering another player's buy-in or receiving their cash-out works without a Trip or Group.

Examples:

- Bea covers Alex's $100 buy-in: Alex owes Bea $100.
- Bea receives Alex's $300 cash-out: Bea owes Alex $300.
- A player's own buy-in or cash-out changes their result without creating a counterparty debt.

Entries affect balances immediately without requiring counterparty confirmation. Both players can see the original record, corrections and who made them.

Ledger entries are the financial source of truth. Balances are derived from non-voided records, not manually maintained balance fields on players, Trips or Groups. Preserve who owes whom. A zero overall net must not erase distinct obligations to different people or automatically reroute them through unrelated players.

All money uses integer minor units. Corrections void the original entry and add a replacement; history remains visible. Store each financial fact once, even if several collections display it.

Trip and Group reports derive from the underlying activity and its provenance. They cannot be reconstructed from a player's final global net.

## Trips and Groups

A Trip is an optional collection of play. It can be private or shared and does not require a Group. A Group is a reusable roster with shared tables and optional Trips. Neither creates another player identity or independent debt ledger.

A shared table belongs to zero or one Trip. Trip membership applies to the table as a unit, including all players' recorded visits and separate return visits. Personal sessions inherit that association; they do not have conflicting independent Trip assignments. Personal history still shows each visit separately.

A Group may show a table directly or through its Trip. Both refer to the same records and must not double-count play or money. Ordinary collection changes preserve the sessions, entries and underlying balances; collection totals reflect the changed membership.

## Whole-Trip backing

Backing is an agreement for one player to fund another player's play for a Trip. It covers all of the backed player's sessions in that Trip. Coverage cannot select individual sessions or start or end partway through the Trip.

The backer funds all covered play. Mixed player-and-backer funding is outside this baseline. The backer bears losses up to the amount funded; the player does not owe replacement money out of pocket for lost backing.

Choose the profit split per agreement and keep it fixed for the Trip. Additional funding is allowed, with each amount recorded under the same agreement. It increases the backer's amount at risk without changing the split.

Return remaining funded money to the backer and divide net profit according to the agreement. With $500 funded and a 50/50 split, a $200 profit gives the backer $600 and the player $100. A $200 loss returns $300 to the backer, who absorbs the loss. The split in this example is illustrative.

The Trip defines which play contributes. The underlying session entries determine the playing results; the agreement determines the allocation. Funding is not winnings. Amounts owed under the agreement belong to the player ledger, with no duplicate capital or payout debt in a separate Trip ledger.

Moving a table out of a backed Trip changes financial coverage. Treat it as an explicit financial correction, with history and recalculated amounts visible to both players. A visibility-only change preserves the agreement and amounts owed. Coverage corrections preserve the original play and payment records.

## Existing supporting scope

Keep the venue catalog, export and access to a player's own history. Adapt their ownership and visibility to the player model. Stats show losses plainly. History and access to personal records are never capped or paywalled.

Color Up never moves money, and it doesn't record payments between people. Sports betting, DFS, bets between people, multiple currencies, mixed backing funds and pooled multi-backer play are outside this baseline. Tournament-specific finishing positions and field sizes remain later work; an entry fee and prize can be recorded as buy-in and cash-out.

## Architecture constraints

Keep the existing monorepo and shared core:

- `packages/contracts` defines wire schemas and the Effect `HttpApi`.
- `packages/shared` owns pure money, results, balances and backing calculations.
- `packages/client-runtime` owns shared client state, persistence and synchronization behavior.
- `apps/api` owns authoritative shared writes and permission checks in thin handlers and feature services.
- `apps/web` uses React, TanStack Router, Tailwind and the existing component system.
- `apps/mobile` uses Expo, React Navigation native-stack and Uniwind. Do not migrate it to Expo Router.

Local recording must work before an account or network is available. Synchronization sends pending operations to the API, which validates access before accepting authoritative shared changes. Stable client-generated IDs make retries idempotent. Persistence failures and rejected writes must be visible.

Keep the relational database and immutable ledger with voids and replacements. Do not introduce a general event-sourcing framework. Separate identity, financial provenance, collection membership and access. New schema details belong in contracts and migrations once their implementation is settled.

Migration preserves existing IDs, monetary amounts, void/replacement history, claimed identities and access boundaries. Do not infer that two guests are the same person from their names. Do not convert existing recorded payments into duplicates or lose counterparty relationships. Old closed records may not contain enough information to reconstruct historical partial finishes or separate visits; preserve provenance rather than inventing facts.

Keep historical table/player participation distinct from native visits when the old data cannot establish visit boundaries. Use a read-only preflight to identify histories needing reconciliation before the global financial cutover. Legacy windowed or overlapping stakes remain explicitly legacy until reconciled.

## Delivery sequence

### 1. Model and migration foundations

Reconcile contracts, pure ledger calculations and database relationships with the baseline. Establish the distinction between a player visit and a shared table, independent player identity, optional collections. Specify and test how existing data migrates before changing production storage.

### 2. Independent recording and review

Implement the real signed-out solo flow on web and mobile using shared client-runtime behavior. Starting, rebuying, partial cash-outs, finishing, corrections and reviewing history work offline and survive relaunch.

The first milestone is $200 in, a $100 rebuy, $100 out while continuing, then a final $250 out. Review shows $300 in, $350 out and a finalized $50 gain. No account, Trip or Group is needed. Before finishing, final win/loss remains pending.

### 3. Shared tables and player relationships

Add direct sharing, dependable guest identity, own-data contribution, starter and recorder permissions, returning players and account claims. Test authorization from the server side, including access revocation and unrelated private activity.

### 4. Optional collections

Adapt Trips and Groups to organize the same records, with table-level Trip membership and reports derived from accessible activity. Verify that overlapping display paths do not double-count records and membership changes do not silently change player obligations.

### 5. Whole-Trip backing

Adapt agreements, funding additions, profit splits, loss allocation and coverage corrections to the player ledger. Test outcomes and corrections without double-counting funding or playing results.

### 6. Verification and release readiness

Run the scoped formatting, lint, unused-code, type and test checks required by `AGENTS.md`. Money calculations need unit and property tests; API behavior and migrations need a real seeded Postgres database. Verify the complete recording loop in the actual web and mobile apps, including offline persistence, sync failures, guest permissions, corrections and review. Use the existing authenticated end-to-end flow where it still applies.
