---
status: planned
created: 2026-11-16
priority: high
tags:
  - api
  - ci
  - mobile
  - infra
created_at: 2026-11-16T06:29:46.607901575Z
updated_at: 2026-11-16T06:29:46.607901575Z
---

# Separate production from development

## Overview

Color Up has one deployed environment. The `development` env in `apps/api/wrangler.jsonc` is the Worker `colorup` on `colorup.stephen-jcombs.workers.dev`, backed by one Neon database through Hyperdrive. CI deploys every push to `main` there, migrations first. Every EAS profile points at it, `production` included, along with the Clerk development instance (`pk_test_…`) and one PostHog project.

So real users' ledgers share a database with every merged change, every manual test, and the simulator E2E flows from spec 018. A bad migration on `main` reaches real users at once, and there's nowhere to test that isn't production.

## Design

- **The current Worker and database become production.** Installed production and preview builds have `https://colorup.stephen-jcombs.workers.dev` baked in. Pointing that URL at a new empty database would strand their data, so the URL keeps serving the data it has.
  - Rename the wrangler env `development` to `production`. The Worker name `colorup`, its Hyperdrive binding and its URL stay.
- **A new development environment.** A Worker `colorup-dev` on `colorup-dev.stephen-jcombs.workers.dev`, its own Hyperdrive config, and a new Neon branch `development`.
  - The branch starts empty, then gets migrated and seeded with `db:seed`. It is not a copy of production: real users' play shouldn't sit in a test database.
- **Deploys:**
  - `main` auto-deploys to development, as it does to `colorup` today.
  - Production deploys from a manual `workflow_dispatch` on a GitHub environment `production` with required reviewers. It runs the same steps: check `main`'s head, migrate, deploy, then health check.
  - Migrations keep the existing rule that each one works with the Worker that is still live.
- **PR previews:** `NEON_PREVIEW_PARENT_ID` points at the `development` branch, not production's, so previews never copy real data.
- **EAS profiles:**
  - `development`, `preview` and `e2e-simulator` use the development API.
  - `production` keeps the production URL.
  - The E2E workflow's guard keeps refusing the production URL, and its `api_url` input defaults to the development API.
- **Secrets:** `DATABASE_URL` splits into a development and a production secret, and the production one goes on the `production` GitHub environment. Cloudflare and Neon tokens stay shared.

### Later phase: production identity and analytics

These need owner accounts and decisions, and one of them forces a new store build. They come after the split.

- **Clerk:** a production instance needs a domain Color Up owns. The development instance caps users and shows a development banner. Switching changes the publishable key, so installed builds must update, and existing Clerk users would need migrating to the new instance.
- **PostHog:** a separate project for development, or an `environment` property on every event, so test traffic stays out of product numbers.
- **Custom domains** for both APIs, so builds don't depend on `workers.dev`.

## Plan

- [ ] Create Neon branch `development`, its Hyperdrive config and the `colorup-dev` Worker env in `apps/api/wrangler.jsonc`; migrate and seed it
- [ ] Rename the wrangler env `development` to `production`, keeping Worker `colorup`, its URL and Hyperdrive
- [ ] CI: `main` deploys to development; add a manual, reviewer-gated production deploy workflow; split `DATABASE_URL`
- [ ] Point `NEON_PREVIEW_PARENT_ID` at the `development` branch
- [ ] EAS: `development`, `preview` and `e2e-simulator` use the development API; default the E2E `api_url` to it
- [ ] Update `AGENTS.md` (Dev, deploys) and `docs/internals` with the two environments and how to promote
- [ ] Later phase: Clerk production instance and domain, PostHog split, custom domains

## Non-goals

- Changing the API, contracts or app behavior.
- Moving off Cloudflare Workers or Neon.
- Copying production data into development or previews.

## Acceptance criteria

- A push to `main` changes `colorup-dev` and leaves `colorup` untouched.
- Production changes only through the reviewed manual workflow, and its health check passes afterwards.
- Installed production builds keep working with their data.
- The simulator E2E flows run against the development API, and no E2E data reaches production.

## Owner decisions needed

- Does the current database hold real users' data that must be kept? If not, production could start fresh, which simplifies the Clerk switch.
- Which domain should Color Up use, and when should the Clerk production instance and the new store build happen?
- Who approves production deploys?
