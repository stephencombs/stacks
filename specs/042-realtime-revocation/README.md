---
status: draft
created: 2026-11-23
tags:
  - api
  - realtime
depends_on:
  - 040-realtime-group-notices
parent: 039-realtime-scope-notices
created_at: 2026-11-23T17:39:56.620033500Z
updated_at: 2026-11-23T17:39:56.620033500Z
---

# Close notice sockets when access is lost

## Overview

The third slice of `039-realtime-scope-notices`. A notice carries no data, so someone who lost access learns only _when_ activity happens, until their next reconnect. That's acceptable on the development environment, but this slice must land before production. Immediate revocation isn't promised: a handshake can race a revoke, and the client's next refetch re-authorizes.

## Design

**Selectors.** At upgrade, each socket gets tags or an attachment holding what's needed to revoke it, and never credentials:

- grant kind
- user id
- resolved actor id (account sockets resolve theirs too)
- a share-grant tag: a hash derived from `tables.share_token_hash`, so no schema change

**Close RPCs.** These are queued after commit, exactly like notices.

| Access lost through                            | Sockets closed                                                                          |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| Share link rotated or removed                  | The old grant tag's sockets. Capture the hash before it's overwritten.                  |
| Table deleted                                  | All of the table's sockets                                                              |
| Leaving or being removed from a group          | That user's sockets on the group, and on the group's open tables                        |
| `set_table_trip` to `null` or to another group | Table sockets authorized through the old group. A move within one group closes nothing. |
| `revokeBinding`                                | Every actor in the revoked recursive chain, on the player's open tables                 |

**Close codes.**

- `4403`: access revoked. The client refetches once, then stops.
- `4404`: table deleted. The client refetches once, then stops.

## Requirements

- [ ] Selectors set at upgrade for every grant kind.
- [ ] A `close(scope, selector, code)` RPC on `ScopeChannel`.
- [ ] Close RPCs queued after commit on every path in the table.
- [ ] Client handling of `4403` and `4404`.

## Acceptance criteria

- [ ] API tests assert the close RPCs for each table row. That includes a move within one group (none), a move to `null`, and the full `revokeBinding` chain, with an account-authenticated socket in the chain.
- [ ] The smoke test checks that a targeted close drops only matching sockets.
- [ ] Upgrade tests refuse a rotated link and a revoked binding.
- [ ] A client test: `4403` and `4404` don't reconnect.
- [ ] Deployed `development`: removing a member closes their open trip-board socket.
- [ ] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, `pnpm test` pass.
