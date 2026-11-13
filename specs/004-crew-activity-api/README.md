---
status: in-progress
created: 2026-11-13
priority: medium
tags:
  - api
  - contracts
  - client-runtime
parent: "001"
created_at: 2026-11-13T04:24:59.515886103Z
updated_at: 2026-11-13T04:24:59.515886103Z
---

# Crew activity API

## Overview

Crew opens on activity from every group you're in. This adds the read endpoint and client query behind it. No UI (spec 006).

## Design

- `GET /crew/activity` in `packages/contracts/src/api.ts`, newest first, a bounded page (for example 50) with a cursor for older items.
- Item kinds: a session going live (who and where), a session finishing (venue, players, the table's results), a trip starting. Each carries group and trip ids and names, so a row can open its session or trip.
- Only groups where the caller is an active member. Nothing from groups they left or were removed from, no personal (device-only) play, and nothing that reveals a player's sessions outside those groups.
- Service in `apps/api/src/features/Crew.ts` with `Effect.fn("Crew.activity")`; thin handler in `apps/api/src/http/Api.ts`.
- Client query in `packages/client-runtime` beside the existing groups query, so web and mobile read it the same way.

## Plan

- [ ] Contract schema and endpoint
- [ ] Service and handler
- [ ] Client-runtime query
- [ ] API tests

## Test

- [ ] Returns items from all of the caller's groups, newest first, paging stable
- [ ] Excludes groups the caller isn't an active member of, including after leaving or removal
- [ ] Voided entries don't count in finished-session results
