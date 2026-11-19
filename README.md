# Stacks

A casino-session ledger for groups of friends: log buy-ins and cash-outs, and see everyone's results and who owes whom. The app runs on native iOS and Android. See `PLAN.md` for scope and phases.

## Layout

| Path                      | What                                           |
| ------------------------- | ---------------------------------------------- |
| `apps/api`                | Cloudflare Worker serving the Effect `HttpApi` |
| `apps/mobile`             | Expo (dev client) + React Navigation + Uniwind |
| `packages/contracts`      | Effect Schema types and the API definition     |
| `packages/client-runtime` | Typed API client and native client state       |

## Develop

Requires Node 22.12+ (CI uses 24), pnpm 10 and Postgres (Docker works).

```sh
pnpm install
docker compose up -d                              # Postgres with `stacks` and `stacks_test`
cp apps/api/.dev.vars.example apps/api/.dev.vars  # then add your Clerk secret key
cp .env.example apps/mobile/.env.local           # then add your Clerk publishable key
pnpm --filter @stacks/api db:migrate
pnpm --filter @stacks/api db:seed -- --owner <your Clerk user ID>
pnpm dev          # API on :8787
pnpm dev:mobile   # Metro for the Expo dev client
```

The seed builds one group with four players, 30 sessions. `venues:import` loads every casino in OpenStreetMap (or `--file` with a saved Overpass export).

In Clerk, add `name` and `picture` claims to the session token (Sessions → Customize session token: `{"name": "{{user.full_name}}", "picture": "{{user.image_url}}"}`) so the API knows what to call people.

The mobile app needs a dev client build on your simulator or phone the first time: `pnpm --filter @stacks/mobile ios` (or `android`), or an EAS build with `pnpm --filter @stacks/mobile eas:dev`. It finds the API on the machine running Metro; set `EXPO_PUBLIC_API_URL` to point it elsewhere.

For development telemetry, add `EXPO_PUBLIC_POSTHOG_TOKEN` and `EXPO_PUBLIC_POSTHOG_HOST` to `apps/mobile/.env.development.local`. Use the development project's token and ingestion host. Without both values, telemetry is off. Keep production on a separate project.

The `development-test-events` flag controls client confirmations of session starts, entries and closes. These events can repeat after a retry and are not ledger counts. Telemetry is held in memory, so unsent events are lost when the app closes. Invite, claim and share path secrets are redacted before send, query strings are dropped, and exception messages and stacks are removed, so errors show occurrence counts but not the original cause.

On mobile, unhandled promise rejections stay with React Native's development warning handler and are not sent to PostHog.

Before enabling telemetry, configure the PostHog project to discard client IP addresses and keep console log capture disabled. These project settings protect data sent outside event capture. The mobile preview profile uses the development project. A new mobile preview build is required to receive configuration changes. New mobile dev clients must be rebuilt for the added Expo modules.

## Deploy

One Cloudflare Worker serves the API. It's the development environment, at <https://colorup.stephen-jcombs.workers.dev>, and signs in through Clerk's development instance. There's no production environment yet. The database is any Postgres behind Cloudflare Hyperdrive (Neon's free plan works).

1. `npx wrangler login` (or set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`).
2. Create the Hyperdrive config: `npx wrangler hyperdrive create stacks --caching-disabled --connection-string="<postgres url>"`, and put its ID in `apps/api/wrangler.jsonc` under `env.development`. Leave caching off: Hyperdrive otherwise serves reads from a cache for up to a minute, so a screen refreshed after a write shows the old ledger.
3. Migrate: `DATABASE_URL="<postgres url>" pnpm --filter @stacks/api db:migrate`.
4. Store the Clerk secret: `pnpm --filter @stacks/api exec wrangler secret put CLERK_SECRET_KEY --env development`.
5. `pnpm run deploy` deploys the API Worker.

After that first setup, every push to `main` migrates the development database and deploys the Worker once checks pass. CI needs the repo secrets `DATABASE_URL`, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Migrations run before the new Worker goes live, so each one has to work with the Worker it replaces. To undo a bad deploy, use `npx wrangler rollback --env development`; it doesn't revert migrations.

The mobile `preview` build profile in `apps/mobile/eas.json` points at the deployed address.

## End-to-end test

The Maestro flows in `apps/mobile/maestro` cover solo recording, Crew and shared tables. Run them on a native emulator or simulator against an isolated test API. Crew needs `MAESTRO_CLERK_SECRET_KEY` from the Clerk development instance to create and remove a disposable user.

## Check

```sh
pnpm fmt && pnpm lint && pnpm knip && pnpm typecheck && pnpm test
```
