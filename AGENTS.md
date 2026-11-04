# Color Up

Color Up is a casino-session ledger for groups of friends. Its working name was Stacks, which the code keeps: the repo, the `@stacks/*` packages and the `stacks://` app scheme. Users only ever see Color Up. Members log buy-ins and cash-outs during a session; the app works out each person's result and who owes whom. It ships as a web app and a native iOS/Android app on one shared core. The repo follows [T3Code](https://github.com/pingdotgg/t3code)'s layout and habits. `PLAN.md` holds the product scope and delivery phases.

Fight for the smallest model that makes the correct behavior unsurprising. Don't keep complexity because it exists, and don't add machinery because it looks impressive.

## Glossary

- **group**: one shared ledger with a fixed currency, and the members who use it.
- **member**: a user in a group, with the role owner, admin or member.
- **guest**: a player in a group who hasn't signed up yet. A guest can later claim their history by signing up.
- **session**: one sitting at a venue, either live or closed.
- **trip**: a run of play inside a group, like a weekend in Vegas. Every session belongs to one trip, and each trip keeps its own balances, stakes, board and settle-up. An ended trip takes no new sessions but can still be settled.
- **entry**: one ledger row: a buy-in, cash-out, adjustment or settlement. Entries are never edited; a correction voids the old one and adds a new one.
- **counterparty**: whose money paid for a buy-in, or who received a cash-out. Debts come from counterparties.
- **result**: a player's win or loss (cash-outs minus buy-ins). A result is separate from a balance.
- **balance**: what a member is owed (positive) or owes (negative) inside a trip.
- **settlement**: a recorded payment between two members that squares up part of a trip. Stacks never moves money.
- **stake**: money one player (the backer) gives another to play with. While it's open, the player's results go to it: the backer gets the stake back plus their share of the winnings, or what's left after losses. What the player owes back counts in balances.

## Hit every surface

A change that works on the path you tested and is missing everywhere else is the most common defect. Before calling a change done, say which of these applied:

- **Clients.** Web (`apps/web`) and mobile (`apps/mobile`). Logic both need lives in `packages/client-runtime`.
- **Contracts.** Anything crossing the wire is typed in `packages/contracts`. Change the schema and the API, web and mobile all follow.
- **Server.** The API (`apps/api`) is the only writer and enforces permissions. Clients only hide controls a user can't use.
- **Reverse states.** If you added a way in, add the way out. Close needs reopen. Void needs to be visible.
- **Money.** Amounts are integer minor units. A float anywhere near money is a bug.

## Dev

- `pnpm install` installs. `pnpm dev` starts the API (wrangler, port 8787) and web (Vite, port 5173). Dev is single-origin: Vite proxies `/api` to the worker, so never bake an API URL into the web build for dev.
- The API needs Postgres: `docker compose up -d`, then `pnpm --filter @stacks/api db:migrate` and `db:seed`. An empty database is a bad test; seed it.
- API tests run against the real `stacks_test` database (`TEST_DATABASE_URL`), not mocks. Each test signs in as fresh users from `users(...)` in `apps/api/src/testing/fixtures.ts`, so tests never see each other's data.
- Workers can't share a socket between requests, so the Worker opens a database client per request. Service functions read `SqlClient` and `CurrentUser` from context; never capture them when a layer is built.
- `pnpm dev:mobile` starts Metro for the dev client. The app finds the API on the same host that serves Metro. Set `EXPO_PUBLIC_API_URL` to override it.
- Stop what you started, by the PID you captured. Never kill by name pattern.

## Verifying

- Run the checks CI runs, scoped to what you touched: `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, `pnpm test`.
- Test meaningful logic and observable behavior. Ledger math (`results`, `balances`, `settleUp`) gets thorough unit and property tests.
- Effect tests use `it.effect` on the `TestClock`. No sleeps, no polling loops, no retries. A test that needs a timeout to pass is wrong.
- A bug fix in logic, data or protocol starts with a failing test.
- See UI changes in the real app before calling them done. `pnpm --filter @stacks/web dev:preview` runs the web app signed in, against fixture data, with no Clerk or database; the `preview-color-up` skill covers routes, fixtures and screenshots.

## Where code lives

- `apps/api`: Cloudflare Worker serving the Effect `HttpApi` defined in contracts. `src/features` holds one module of service functions per feature, `src/http/Api.ts` the thin handlers, `src/db/migrations` the SQL migrations (append new ones to `migrations/index.ts`).
- `apps/web`: React 19, Vite (through vite-plus), TanStack Router file routes, Tailwind v4. Data goes through `src/lib/stacks.tsx`: `<Loaded query={…}>` renders a query with its loading and error states, and `useAction(mutation)` runs a write, refreshes what's on screen and turns failures into a sentence. Screens never call the API client directly.
- `apps/web/src/components/ui` exports own their look: pick a `variant` or `size`, and pass only layout classes (margin, width, flex). A look that belongs to one screen stays in that screen.
- `docs/internals/navigation.md` decides where content lives and how people move between it. Read it before adding a page, tab, menu or route.
- `DESIGN.md` is the design system: read it before building UI. `/design.html` on the web dev server shows the shared web parts and their states.
- `apps/web/e2e` holds the Playwright test of the full loop against the real Clerk development instance (`pnpm --filter @stacks/web test:e2e`). Run it after changing a flow it covers.
- `apps/mobile`: Expo with a dev client, React Navigation native-stack (static config), Uniwind. Expo, EAS, and React Native API work follows [Expo](#expo).
- `packages/contracts`: Effect Schema types and the `StacksApi` definition. No runtime logic.
- `packages/shared`: pure ledger logic shared by the API and clients: `money`, `results`, `balances`, `settleUp`. Import a subpath; there's no root export.
- `packages/client-runtime`: client code shared by web and mobile. Import an explicit subpath (`@stacks/client-runtime/api`); there's no root export.
- Charts, the T3Code way, with no chart library: shape the data in `packages/shared`, take scales from `@stacks/client-runtime/chart`, and draw it per platform: SVG on web, `react-native-svg` and plain views on mobile.
- New web components are copied from shadcn/ui's Base UI versions (coss ui if shadcn lacks one) and adapted to our tokens; no `shadcn init`. Watch the names: our `accent` is the brand gold and our `muted` is text, so shadcn's `bg-accent` and `bg-muted` compile but mean something else.
- Dependency versions live in the `catalog:` in `pnpm-workspace.yaml`. Add a shared dependency there, not as a version in one package.

## Taste

- Complexity belongs at the edges. Ledger logic stays pure; UI stays dumb.
- Server features are services; transports stay thin. A handler decodes input, calls one service method and maps errors.
- Reusable Effect functions use `Effect.fn("Service.operation")` with a stable span name.
- Inferred types over annotations. `any` is the enemy.
- Default to no comment. Write one only for a constraint, an external quirk, or an invariant the code can't show.
- React effects are for synchronizing with something outside React. Derive in render and act in handlers.
- Web and mobile share one palette (OKLCH tokens in `apps/web/src/index.css` and `apps/mobile/global.css`). Change both together.

## Pull requests

- Never open a PR unless asked.
- Conventional commit titles in plain language: `feat(mobile): live session quick rebuy`.
- UI changes need before/after screenshots. Host them on a `pr-assets/<branch>` orphan branch, never in the PR's own commits.

## Documentation

Most changes need no doc change. Agents can read the code.

- `docs/internals/` holds decisions and their reasons, constraints that span apps, and traps the source can't show. Before adding a paragraph, ask what a maintainer would get wrong without it. If reading the code answers the question, leave it out.
- Don't document every feature, list fields or files, narrate control flow, or append PR summaries. Types, tests and code already record the implementation.
- A local reason goes in a short comment beside the code. Use an internal doc when the reasoning crosses apps or needs context the code can't carry.
- When a decision changes, rewrite or remove the text it affects. Don't append a second account. A new page needs a durable reason to exist, and a line in `docs/README.md`.
- `DESIGN.md` and `docs/design/` say which part to use and how it should look. Keep them in step with `apps/web/src/components/ui` and the mobile components.

## Plans and work artifacts

- `PLAN.md` is the product scope and its phases. Don't commit other plans, research notes or agent scratch files; keep working material outside the worktree.
- Research that leads to a decision lands as the decision, in `docs/internals/`, with a link or two to its strongest sources.
- A merged PR is the implementation record. Don't keep a second checklist in the repo.

## Expo

`apps/mobile` is the Expo app. The `expo` version in `apps/mobile/package.json` is the SDK it targets. Expo ships breaking changes every SDK, so an API you remember may be renamed, moved, or removed. Before writing code that touches an Expo, EAS, or React Native API:

1. Read that `expo` version.
2. Fetch the matching docs at `https://docs.expo.dev/versions/v<major>.0.0/` (SDK 58 is `https://docs.expo.dev/versions/v58.0.0/`).
3. For anything else, fetch https://docs.expo.dev/llms.txt and follow its links. Answer from those pages.

Load the `expo-overview` skill first on Expo or EAS work, then the leaf skill it names. This file wins when a skill disagrees. This app uses React Navigation native-stack (`apps/mobile/src/App.tsx`), `@stacks/client-runtime` for server data, and integer minor units for money. Keep that. `expo-project-structure` is for a new app, and Expo Router is not how this app navigates.

### Commands

Run Expo and EAS from `apps/mobile`. This repo uses pnpm.

```bash
pnpm exec expo install <package>  # SDK-compatible version. Never add an expo-* or react-native package by hand.
pnpm exec expo start --dev-client # Metro. From the repo root, `pnpm dev:mobile`.
pnpm exec expo-doctor
pnpm exec expo install --fix
npx eas-cli@latest <command>      # `pnpm eas:dev` and `pnpm eas:preview` use the profiles in eas.json
```

A library only mobile uses can stay on the version `expo install` writes. A library shared with web goes in the `catalog:` in `pnpm-workspace.yaml`. Lint, format, and test from the repo root, as in Verifying. EAS docs: https://docs.expo.dev/eas/index.md

### Native projects

`ios/` and `android/` under `apps/mobile` are generated (Continuous Native Generation) and gitignored. Never create or edit them by hand. Configure native behavior in `app.config.ts` and config plugins.

Expo Go does not include this app's native modules. After adding a library with native code, ship a new development build: `pnpm exec expo run:ios` or `run:android`, or `pnpm eas:dev`.

### Agents

Expo skills from `expo/skills` live in `.agents/skills`, linked from `.claude/skills` and `.codex/skills`. Claude Code enables the `expo@claude-plugins-official` plugin in `.claude/settings.json`. Each machine installs it once: `claude plugin install expo@claude-plugins-official`. Codex: `codex plugin add expo@openai-curated`, then `codex mcp login expo`.

The Expo MCP server is `https://mcp.expo.dev/mcp`. Sign in with an Expo account before using it. Docs and Expo Services (builds, workflows, updates, TestFlight) work after that. Local simulator screenshots from the server also need the `expo-mcp` dev dependency and `EXPO_UNSTABLE_MCP_SERVER=1` on Metro. Docs: https://docs.expo.dev/mcp.md
