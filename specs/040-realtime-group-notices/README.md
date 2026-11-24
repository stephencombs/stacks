---
status: complete
created: 2026-11-23
tags:
  - api
  - client-runtime
  - mobile
  - realtime
parent: 039-realtime-scope-notices
created_at: 2026-11-23T17:39:55.356501400Z
updated_at: 2026-11-24T02:36:42.913137600Z
completed_at: 2026-11-24T02:36:42.913137600Z
transitions:
  - status: planned
    at: 2026-11-24T02:36:30.332227700Z
  - status: in-progress
    at: 2026-11-24T02:36:30.938332800Z
  - status: complete
    at: 2026-11-24T02:36:42.913137600Z
---

# Group change notices, end to end

## Overview

This is the first slice of `039-realtime-scope-notices`. It builds the whole pipeline and proves it on the simplest data path, group writes, which feed screens that already refetch through atom queries (`AtomHttpApi`, `useRevalidate`). See the umbrella for the decisions.

## Design

**Server.**

- A `Realtime` service queues scopes only after a transaction or autocommit statement succeeds. Only writes that change a row queue anything; check with `returning`. Idempotent replays and `on conflict do nothing` queue nothing.
- `worker.ts` gains `ctx` and calls `ctx.waitUntil(flush)` when the handler finishes, whatever the HTTP status. `Guests.claim`, for example, commits and then builds a view that can still fail.
- The flush wrapper and upgrade auth live in shared modules, so `TestApi` exercises them too.
- The flush makes one RPC per scope and logs failures with the scope kind.

| Write                                                                                         | Scopes  |
| --------------------------------------------------------------------------------------------- | ------- |
| Stakes: create, end, reopen, void. Trips: create, rename, end, reopen, delete.                | `group` |
| Groups: rename, leave, remove, set role. Guests: add, claim. Invites: create, revoke, accept. | `group` |

`Groups.create` notifies nothing, because nobody can be subscribed to a group that didn't exist yet.

**`ScopeChannel` Durable Object.**

- `acceptWebSocket`, `getWebSockets()`, `setWebSocketAutoResponse("ping", "pong")`. No timers, alarms or outbound fetches. It stores nothing.
- A send that fails affects only its own socket.
- At most 100 sockets per object. Past that, the upgrade gets 503, and an existing socket can be closed with `4429`.
- `durable_objects.bindings` is declared at the top level and again under `env.development`. `migrations` is top-level only, with one `new_sqlite_classes` tag.
- Export the class from the Worker entry.
- Deploy the API before any app build that connects. A Durable Object migration can't be undone by reverting a commit.

**Upgrade.**

- `GET /api/realtime/group:<id>`, routed in `worker.ts` before the HttpApi handler.
- `Authorization: Bearer <clerk jwt>`, checked with the verifier exported from `Clerk.ts` so the `isNativeSession` check is kept.
- It applies the group GET's membership check. Logs record rejections by status, reason and scope kind, never credentials.

**Config.** Disable query caching on the development Hyperdrive config. Hyperdrive can't skip its cache for one query.

**Client.**

- `packages/client-runtime` takes an injected `openSocket(url, headers)` and an app-state adapter. `apps/mobile` implements `openSocket` with `new WebSocket(url, null, { headers })`.
- Each scope gets one shared, ref-counted connection.
- `useScopeNotices` connects only while its screen is focused (`useIsFocused()`). It closes on `background`, not `inactive`, reopens on `active`, and fetches a fresh token on every attempt. If `getToken()` returns null, it doesn't connect.
- While foregrounded, it sends `ping` every 30s and reconnects if no `pong` arrives within 10s.
- Reconnects back off with jitter, up to 30s. After a `1006` before `open`, the client checks the scope's HTTP view. A 401, 403 or 404 there stops it reconnecting.
- Once the socket opens, it refetches once and retries queries that ended in an error.
- A notice marks the screen's queries dirty, and the mark clears when a fetch **starts**. If it's still dirty when the fetch finishes, one trailing refresh runs. Notices coalesce over 200ms.
- Subscribers:
  - Crew: the distinct groups in its pinned trip and loaded activity, at most 10.
  - Group and Group stats: `group:<id>`.
  - Trip board (`SessionsScreen`): its trip's group.

## Requirements

- [x] Contracts: `ScopeNotice`, the scope id format, and the close codes.
- [x] `Realtime` service, the post-commit queue, and the `ctx.waitUntil` flush, shared with `TestApi`.
- [x] Every group write above queues its scope after commit, with change detection.
- [x] `ScopeChannel`, its bindings and migration, and the socket cap.
- [x] `/api/realtime/:scope` upgrade with `Bearer` auth, accepting only `group:` scopes in this slice.
- [x] Development Hyperdrive caching disabled.
- [x] Client transport adapter, `useScopeNotices`, the dirty-and-trailing refresh, and the screens wired up.
- [x] A smoke test under workerd, through Miniflare or `wrangler dev`, run from `pnpm --filter @stacks/api test`.

## Acceptance criteria

- [x] API tests, one case per write row, assert the queued scopes. They also cover a rolled-back write and an idempotent replay (nothing queued), and a committed write followed by a failed response (still queued).
- [x] Upgrade tests:
  - `426` for a request that isn't an upgrade
  - a malformed scope
  - a missing or expired token (`401`)
  - a non-member and a former member (refused)
  - the socket cap
- [x] The smoke test passes:
  - two scopes stay isolated
  - a broadcast reaches only its scope
  - a throwing socket doesn't block the others
  - `ping` gets `pong` without waking the object
- [x] Client tests on the `TestClock` cover:
  - a notice during an in-flight fetch that finishes after it: one trailing refresh
  - a notice inside `DEDUPE_MS`: still refreshes
  - a burst of notices: one refresh
  - `inactive`: socket kept; `background`: socket closed
  - losing focus: socket released
  - a missed pong: reconnect
  - a reconnect: one catch-up per query
- [ ] Deployed `development`:
  - a socket idle past hibernation still receives a broadcast
  - a stake created on one phone shows on another phone's trip board, normally within 2s
  - headers reach the Worker on both iOS and Android
- [x] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, `pnpm test` pass.
