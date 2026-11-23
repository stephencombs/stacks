---
status: draft
created: 2026-11-23
priority: medium
tags:
- api
- realtime
created_at: 2026-11-23T04:49:53.063215400Z
updated_at: 2026-11-23T05:19:46.711289400Z
---

# Push change notices to clients watching a group or table

## Overview

Writes are already commands: client-generated ids, an on-device outbox, idempotent pushes. Reads are the gap. A phone refetches when it writes, or when a screen mounts or the app wakes. It never hears about a buy-in, cash-out, stake or trip change someone else made, so an open trip board or shared table stays stale.

Once a write commits, the API tells a Durable Object for each affected scope (`group:<id>`, `table:<id>`). The object forwards `{ scope, origin }` to every socket watching that scope, and each open screen refetches through the read path it already uses.

This umbrella holds the decisions. The child specs carry the work, and each one works end to end on two phones.

## Decisions

- **Notices, not events.** A notice carries no ledger data. Postgres views stay the only source of truth and the only read path, and every refetch re-authorizes. This keeps `PLAN.md`'s ban on an event-sourcing framework.
- **Best effort.** A lost notice costs freshness, never correctness. The next notice, a navigation, a wake, or the refetch on reconnect heals it.
- **No change-feed table.** A feed with no reader guarantees nothing. We'd add durable dispatch (a feed plus a relay) only if delivery had to survive a Worker failing between commit and dispatch.
- **One Durable Object per scope, not per user.** It serves group fan-out and anonymous share-link viewers alike, and needs no subscriber discovery.
- **Sent after commit, whatever the status.** Notices queue only after a transaction commits, and `ctx.waitUntil` sends them when the handler finishes, even if the response failed.
- **Hibernation only.** No timers, alarms, outbound fetches or `ws.accept()` in the object, and no socket lease. A Durable Object that stays awake is the one real cost risk: about $4 a month per object.
- **Revocation isn't immediate.** Close messages cover the known ways access is lost. Otherwise, the next refetch gets a 403 or 404.

## Cost

At about 500 active players it costs nothing beyond the Workers Paid base ($5 a month). At about 50k monthly users, roughly $2–3 a month, almost all of it Durable Object requests. Durable Objects aren't covered by Cloudflare's Workers spending limit, so set a billing alert.

## Slices

- `039-realtime-group-notices`: the notice pipeline, `ScopeChannel`, the upgrade route, the phone connection, and the Crew, Group and trip board screens. It ships first.
- `040-realtime-table-notices`: recording writes, `Actor` and `Share` auth, echo suppression, and the table screens. Depends on 039.
- `041-realtime-revocation`: closing sockets when access is lost. Depends on 039. **It must land before this reaches production.**

## Acceptance criteria

- [ ] All three children are complete.
- [ ] Deployed `development`: billed idle duration for `ScopeChannel` stays flat across a week of normal use.
