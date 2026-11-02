# Stacks

A casino-session ledger for groups of friends: log buy-ins and cash-outs, see everyone's results, and settle up who owes whom. Web and native iOS/Android apps share one core. See `PLAN.md` for scope and phases.

## Layout

| Path                      | What                                                |
| ------------------------- | --------------------------------------------------- |
| `apps/api`                | Cloudflare Worker serving the Effect `HttpApi`      |
| `apps/web`                | React + Vite + TanStack Router + Tailwind v4        |
| `apps/mobile`             | Expo (dev client) + React Navigation + Uniwind      |
| `packages/contracts`      | Effect Schema types and the API definition          |
| `packages/client-runtime` | Typed API client and state shared by web and mobile |

## Develop

Requires Node 22.12+ (CI uses 24), pnpm 10 and Postgres (Docker works).

```sh
pnpm install
docker compose up -d                              # Postgres with `stacks` and `stacks_test`
cp apps/api/.dev.vars.example apps/api/.dev.vars  # then add your Clerk secret key
cp .env.example apps/web/.env.local                # then add your Clerk publishable key
pnpm --filter @stacks/api db:migrate
pnpm --filter @stacks/api db:seed -- --owner <your Clerk user ID>
pnpm dev          # API on :8787 and web on :5173 (Vite proxies /api)
pnpm dev:mobile   # Metro for the Expo dev client
```

The seed builds one group with four players, 30 sessions and some settlements. `venues:import` loads every casino in OpenStreetMap (or `--file` with a saved Overpass export).

In Clerk, add `name` and `picture` claims to the session token (Sessions → Customize session token: `{"name": "{{user.full_name}}", "picture": "{{user.image_url}}"}`) so the API knows what to call people.

The mobile app needs a dev client build on your simulator or phone the first time: `pnpm --filter @stacks/mobile ios` (or `android`), or an EAS build with `pnpm --filter @stacks/mobile eas:dev`. It finds the API on the machine running Metro; set `EXPO_PUBLIC_API_URL` to point it elsewhere.

## Deploy

One Cloudflare Worker serves the API and the built web app. It's the development environment, at <https://stacks.stephen-jcombs.workers.dev>, and signs in through Clerk's development instance. There's no production environment yet. The database is any Postgres behind Cloudflare Hyperdrive (Neon's free plan works).

1. `npx wrangler login` (or set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`).
2. Create the Hyperdrive config: `npx wrangler hyperdrive create stacks --caching-disabled --connection-string="<postgres url>"`, and put its ID in `apps/api/wrangler.jsonc` under `env.development`. Leave caching off: Hyperdrive otherwise serves reads from a cache for up to a minute, so a screen refreshed after a write shows the old ledger.
3. Migrate: `DATABASE_URL="<postgres url>" pnpm --filter @stacks/api db:migrate`.
4. Store the Clerk secret: `pnpm --filter @stacks/api exec wrangler secret put CLERK_SECRET_KEY --env development`.
5. `pnpm run deploy` builds the web app and deploys the Worker.

After that first setup, every push to `main` migrates the development database and deploys the Worker once checks pass. CI needs the repo secrets `DATABASE_URL`, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Migrations run before the new Worker goes live, so each one has to work with the Worker it replaces. To undo a bad deploy, use `npx wrangler rollback --env development`; it doesn't revert migrations.

The mobile `preview` build profile in `apps/mobile/eas.json` points at the deployed address.

## End-to-end test

`pnpm --filter @stacks/web test:e2e` runs the whole loop in a browser against your Clerk development instance: two people make a group, invite each other, play a session, close it and settle up. It creates throwaway Clerk users (`+clerk_test` emails and 555-01XX numbers, which Clerk never messages) and deletes them afterwards. It starts the API and web dev servers itself, and needs Postgres running. Set `E2E_SCREENSHOT_DIR` to save desktop and phone screenshots, or `E2E_BASE_URL` to run it against a deployed site instead. CI runs the web and mobile suites on every push to `main` and nightly; that needs the repo secret `CLERK_SECRET_KEY`.

## Check

```sh
pnpm fmt && pnpm lint && pnpm knip && pnpm typecheck && pnpm test
```
