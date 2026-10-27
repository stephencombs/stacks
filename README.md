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
cp apps/api/.dev.vars.example apps/api/.dev.vars  # then add your Clerk keys
pnpm --filter @stacks/api db:migrate
pnpm --filter @stacks/api db:seed -- --owner <your Clerk user ID>
pnpm dev          # API on :8787 and web on :5173 (Vite proxies /api)
pnpm dev:mobile   # Metro for the Expo dev client
```

The seed builds one group with four players, 30 sessions and some settlements. `venues:import` loads every casino in OpenStreetMap (or `--file` with a saved Overpass export).

In Clerk, add `name` and `picture` claims to the session token (Sessions → Customize session token: `{"name": "{{user.full_name}}", "picture": "{{user.image_url}}"}`) so the API knows what to call people.

The mobile app needs a dev client build on your simulator or phone the first time: `pnpm --filter @stacks/mobile ios` (or `android`), or an EAS build with `pnpm --filter @stacks/mobile eas:dev`. It finds the API on the machine running Metro; set `EXPO_PUBLIC_API_URL` to point it elsewhere.

## Check

```sh
pnpm fmt && pnpm lint && pnpm knip && pnpm typecheck && pnpm test
```
