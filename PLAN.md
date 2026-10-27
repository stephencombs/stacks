# Stacks: plan

Stacks is a casino-session ledger for groups of friends. Members log buy-ins and cash-outs during a session. The app works out each person's result and keeps a running tally of who owes whom when someone covers another person's buy-in or collects their chips. It ships as a web app and a native iOS/Android app on one shared core, and the repo is laid out like [T3Code](https://github.com/pingdotgg/t3code).

## Product scope

### v1: what we build

- **Accounts.** Sign in with Clerk (email, Google, Apple) on web and mobile.
- **Groups.** A group is one shared ledger with a fixed currency. You can create one, invite people with a link or code, and give members the owner, admin or member role. Members can leave, and admins can remove them.
- **Guest players.** Anyone can add a friend who hasn't signed up as a guest, with just a name. Guests play, owe and are owed like anyone else. Each guest gets a claim link; when they sign up through it, their history becomes theirs.
- **Sessions.** A session is one trip or sitting: a venue (a casino, or online), a game, a start and end time, and the people who played. A session is either _live_ or _closed_. An admin can reopen a closed session, so closing isn't permanent.
- **Entries.** An entry is a buy-in, a rebuy, a cash-out or an adjustment for one player. Each entry also records whose money paid for it (a buy-in) or who received it (a cash-out). That's how debts appear without anyone typing them in.
- **Balances and settle up.** Each member gets a net balance. "Settle up" shows the fewest payments that clear every balance, and a payment, once recorded, becomes a settlement entry.
- **Venues.** Everyone picks from one shared catalog of casinos and online casinos, so "Bellagio" means the same place in every group. You can add a casino that's missing, and it's usable right away. Home games are the exception: "Mike's garage" stays private to the group that added it.
- **History and stats.** Results over time for you and for the group, broken down by game, venue and member, with session counts and hours played.
- **Live session mode on mobile.** A screen you can use one-handed at the table: big buttons for "Rebuy $X" and "Cash out", haptic feedback, and the screen stays awake.
- **Responsible-play basics.** Optional personal loss limits and session-length reminders. Stats always show losses plainly, not just wins.
- **Export.** CSV export for each group.

### Not in v1 (on purpose)

- Moving real money. Settlements are records only. Moving money would make the app a payment processor, with licensing and app store consequences.
- Sports betting, DFS, and bets between people.
- Pooled or staked play, where several people split one buy-in by share. This is the most likely v2 feature, and the entry model below leaves room for it.
- Multiple currencies inside one group.
- Poker tournament details. A tournament is logged like any other session: the entry fee is a buy-in and any prize is a cash-out. Finishing place, field size and re-entries can come later.
- Offline writes. Reads are cached, and writes need a connection. The IDs are generated on the client, so we can add an offline queue later without changing the schema.

### How debts arise

| Event                                                  | Recorded as                                   | Debt effect                          |
| ------------------------------------------------------ | --------------------------------------------- | ------------------------------------ |
| Bea covers Alex's $100 buy-in                          | `buy_in` 100, player Alex, counterparty Bea   | Alex owes Bea $100                   |
| Alex cashes out $300 and Bea holds the cash            | `cash_out` 300, player Alex, counterparty Bea | Bea owes Alex $300                   |
| Alex pays Bea back $100                                | `settlement` 100, from Alex, to Bea           | Alex's debt to Bea goes down by $100 |
| An entry with no counterparty (the player's own money) | —                                             | Affects results only                 |

A player's session result is the sum of their cash-outs and adjustments minus the sum of their buy-ins. That number is separate from debts: you can win at the table and still owe a friend.

## Architecture

This follows T3Code: Effect end to end, typed contracts shared over the wire, and client logic shared between web and mobile. T3Code is built around a local server; Stacks swaps that for a cloud API shaped like T3Code's `infra/relay` (Cloudflare Worker, Postgres, Clerk, deployed with alchemy).

```
apps/
  api/        Cloudflare Worker: Effect HttpApi, Clerk JWT auth, Postgres
  web/        React 19 + Vite + TanStack Router + Tailwind v4 + Base UI
  mobile/     Expo + React Navigation native-stack + Uniwind + Clerk Expo
packages/
  contracts/       Effect Schema domain types and the RpcGroup definitions. No runtime logic.
  shared/          Pure logic with subpath exports: money, results, balances, settle-up, time
  client-runtime/  Typed API client (AtomHttpApi), auth token wiring, atoms, optimistic mutations (web + mobile)
docs/
  internals/  Decisions and constraints only (T3Code's doc rules)
```

### Request flow

1. A client calls an endpoint of the `StacksApi` defined in `@stacks/contracts` (Effect `HttpApi`, as T3Code's relay does), using `@stacks/client-runtime` and sending a Clerk session token.
2. In `apps/api`, the handler decodes the input and calls **one service method**. It then maps errors. Transports stay thin.
3. The service checks group membership and role, then writes in a single transaction. Ledger rows are only ever inserted: an edit voids the old entry and inserts a new one, so the audit trail stays complete.
4. Reads come back as projections the client can use directly: group summary, session detail, balances. Balances and results are computed with the same `@stacks/shared` functions the client uses, so optimistic UI and the server always agree.

### Key decisions

- **Money is stored as integer minor units** (`bigint` in the database, a branded `Money` schema in contracts). Never floats. The group's currency sets the formatting.
- **Client-generated UUIDv7 IDs** on every create. This makes mutations idempotent: retrying is safe, optimistic rows reconcile by ID, and an offline queue can be added later.
- **The database is plain relational with an append-only ledger. No event sourcing.** T3Code needs event sourcing for agent orchestration. A ledger only needs immutable entries plus voids.
- **Realtime is phase 2.** Run one Durable Object per group that pushes "invalidate" messages over a WebSocket. Until then, clients refetch on focus and after their own mutations. This is plenty for v1.
- **The API is the only writer.** The server enforces permissions, and clients only hide controls they can't use (T3Code's `permissionAtom` pattern).

## Data model (Postgres)

```
users            id (clerk user id), display_name, avatar_url, created_at
groups           id, name, currency (ISO 4217), created_by, created_at, archived_at
memberships      group_id, user_id, role (owner|admin|member), joined_at, left_at
invites          id, group_id, code, created_by, expires_at, max_uses, uses, revoked_at
venues           id, name, kind (casino|online|home), city, region, country (ISO 3166),
                 lat, lng, source (osm|curated|user), source_ref, verified_at,
                 merged_into_id, group_id (set only for home venues), created_by, created_at
sessions         id, group_id, venue_id, game (slots|blackjack|roulette|craps|baccarat|
                 poker_cash|poker_tourney|other), status (live|closed),
                 started_at, ended_at, notes, created_by, closed_by, reopened_at
players          id, group_id, display_name, user_id (null for a guest), claim_code,
                 claimed_at, created_by, created_at
session_players  session_id, player_id, joined_at
entries          id, group_id, session_id (null for settlements), kind
                 (buy_in|cash_out|adjustment|settlement), player_id, counterparty_id
                 (both players.id),
                 amount_minor (bigint, > 0), occurred_at, note,
                 created_by, created_at, voided_at, voided_by, void_reason,
                 replaces_entry_id
user_limits      user_id, loss_limit_minor, period (day|week|month), session_reminder_min
```

Rules (enforced in the service, with the shape enforced by DB constraints too):

- A session can't close while any player has buy-ins and no cash-out. They can cash out $0 to record a bust.
- The creator of an entry, its player, or a group admin can void it. Voided entries stay visible in the session history, struck through.
- Buy-ins and cash-outs are positive. An adjustment is a signed, non-zero correction to one player's result and never has a counterparty. A counterparty is always someone other than the player; the player's own money has no counterparty.
- A settlement's `player_id` is the payer and its `counterparty_id` is the payee. Both must be players in the group.
- Every ledger reference points at `players`, never at `users`. A member's player row is created when they join, and claiming a guest just sets `user_id` on the guest's row, so no history has to move. Someone who joins and then claims a guest ends up with the guest's row; their empty auto-created row is removed.
- Casino and online venues have no `group_id` and belong to the shared catalog. A home venue always has a `group_id`, and only that group can see or pick it.
- A venue a user adds is usable everywhere at once and shows as unverified until we review it. Duplicates get merged: the duplicate's `merged_into_id` points at the venue that stays, and the duplicate's sessions are moved to it. Moving a session's venue is not a ledger change, so it doesn't need a void.
- The catalog only names places. Stats for a venue are always computed inside one group; nothing shows how other groups did at a venue.
- Someone who leaves a group keeps their history and balances. They can't leave while their balance isn't zero (admins can override this).

## Shared logic (`packages/shared`)

These are pure functions with thorough unit tests, and they're the first code written:

- `money`: parse, format and add amounts in a currency, with no float math anywhere.
- `results`: each player's result for a session, each member's result over a range, and breakdowns by game and venue.
- `balances`: net balance per member, built from non-voided entries.
- `settleUp`: transfers that clear those balances. Debtors and creditors are paired from largest to smallest, so n players never need more than n − 1 transfers. Finding the true minimum is NP-hard and not worth it for a friend group. Property tests check that every transfer list zeroes every balance.

## Clients

### Screens (on both web and mobile)

1. **Groups:** your groups, each with your balance in it, and a banner for any live session.
2. **Group home:** the live session card, member balances, recent sessions, and a "Settle up" button.
3. **Session:** players, each one's buy-ins and cash-outs and running result, the entry timeline (with voids shown), and close or reopen.
4. **New session:** pick a venue (your group's recent venues first, then nearby ones if you allow location, then search across the catalog, with "Add a venue" when nothing matches), a game and the players.
5. **Live mode (mobile):** fast entry with preset amounts, plus "who paid?" and "who's holding?" pickers that default to the player themself.
6. **Settle up:** the suggested transfers, with "Mark paid" to record each one.
7. **Stats:** results over time, and breakdowns by game, venue and member.
8. **Settings:** profile, limits, reminders, invite management, export.

### Web (`apps/web`)

- Vite, React 19, TanStack Router (file routes), and Tailwind v4 with OKLCH tokens.
- Base UI primitives wrapped in `components/ui` that own their look (the T3Code rule: pick a variant, don't restyle with `className`).
- `@clerk/react` for auth, and `@effect/atom-react` for the atoms from client-runtime.
- Deploy to Vercel (as T3Code does) or Cloudflare Pages.

### Mobile (`apps/mobile`)

- Expo with a dev client, React Navigation native-stack (T3Code doesn't use expo-router), and Uniwind so mobile shares Tailwind tokens with web.
- `@clerk/expo` with `expo-secure-store` for tokens, plus `expo-haptics`, `expo-keep-awake`, `expo-location` (only when the venue picker asks for nearby places) and `@legendapp/list` for the long entry lists.
- EAS builds with three profiles: `development`, `preview` and `production`, all driven by `APP_VARIANT` the way T3Code's `app.config.ts` does it.
- Later: a home screen widget and an iOS Live Activity for a live session.

## Tooling (copied from T3Code)

- pnpm workspace with a dependency `catalog:` so every package uses the same versions. Take T3Code's current catalog as the starting point (Effect 4, React 19, Tailwind 4, Clerk).
- `vite-plus` (`vp`) for dev, build, test (Vitest), lint (oxlint) and format. `@tsc-rs/typescript` for fast typechecking, and `knip` to catch unused code and dependencies.
- Root scripts: `dev`, `dev:web`, `dev:api`, `typecheck`, `lint`, `fmt`, `test`, and `check:changed`.
- `AGENTS.md`/`CLAUDE.md` adapted from T3Code's: glossary (group, session, entry, settlement, balance, result), "hit every surface" (web + mobile + API + contracts), taste rules, and test rules (`it.effect` with `TestClock`, no sleeps).
- GitHub Actions: lint, typecheck and test on every PR, with change detection so only affected packages run. Separate workflows for web previews, the API deploy with per-PR preview stages through alchemy, and EAS preview builds.
- A local dev database: Postgres in Docker (or a Neon branch), migrations with drizzle-kit, and a seed script that builds a realistic group of 4 people, 30 sessions and some settlements. The venue catalog has its own import script (see phase 2). An empty database is a bad test.

## Delivery phases

| Phase       | Deliverable                                                                                                                                                               | Done when                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 0. Scaffold | Monorepo, catalog, vp config, tsconfig base, CI, AGENTS.md, empty apps that boot                                                                                          | `pnpm dev` runs web, api and Expo. CI is green                                     |
| 1. Core     | `contracts` schemas and `shared` ledger logic                                                                                                                             | Unit and property tests cover money, results, balances and settle-up               |
| 2. API      | DB schema and migrations, Clerk auth, services and endpoints for groups, invites, venues, sessions, entries and settlements, the venue catalog import, plus a seed script | Integration tests run against a real Postgres. The preview stage deploys           |
| 3. Web      | client-runtime and every v1 screen on the web                                                                                                                             | A full flow works on web: create a group, invite someone, run a session, settle up |
| 4. Mobile   | The same screens on Expo, plus live mode                                                                                                                                  | The same flow works on iOS and Android dev clients. EAS preview build exists       |
| 5. Polish   | Stats, limits and reminders, CSV export, empty and error states, `emil-prep-for-prod` pass                                                                                | Ready for TestFlight and a Play internal track                                     |
| 6. Next     | Realtime with a Durable Object, offline write queue, pooled play, widgets and Live Activity                                                                               | —                                                                                  |

## Risks and open questions

- **App store review.** Apple and Google allow tracking apps that don't involve real-money wagering, but expect a 17+ age rating, and the listing copy must not suggest the app takes bets. Don't link out to casinos or sportsbooks.
- **Data sensitivity.** Gambling records are personal. Members see only their own groups, and every query is scoped by membership. Add account deletion (the App Store requires it): delete the profile and anonymize the user's ledger rows, so other members' balances still add up.
- **Disputed entries.** v1 lets the creator, the player or an admin void an entry. If that turns out to be too loose, add a "player must confirm entries made for them" setting.
- **Seeding the venue catalog.** Import land-based casinos from OpenStreetMap (`amenity=casino`), and hand-curate a short list of online casinos. OSM data is under the ODbL, which requires credit to OpenStreetMap and makes the catalog itself share-alike if we ever publish it. That's fine for an in-app list, but the app needs an attribution line. Re-running the import updates venues by `source_ref` and never deletes one that sessions use.
- **Moderation.** User-added venues show up for everyone, so names need a length limit and basic filtering. Reviewing, verifying and merging venues needs a small admin tool; until it exists, a script can do it.
