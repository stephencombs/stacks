import * as Schema from "effect/Schema";

import type { GroupId } from "./ids.ts";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** What a change notice is about: `group:<groupId>` or `table:<tableId>`. */
export const ScopeId = Schema.String.check(
  Schema.isPattern(new RegExp(`^(group|table):${UUID}$`, "i")),
).pipe(Schema.brand("ScopeId"));

export type ScopeId = typeof ScopeId.Type;

export const groupScope = (groupId: GroupId) => ScopeId.make(`group:${groupId}`);

export const scopeKind = (scope: ScopeId) => (scope.startsWith("group:") ? "group" : "table");

/**
 * Something in the scope changed. It carries no ledger data: whoever hears it refetches through
 * the API. `origin` names the writer so a client can skip its own echo; group writes send none.
 */
export const ScopeNotice = Schema.Struct({
  scope: ScopeId,
  origin: Schema.NullOr(Schema.String),
});

export type ScopeNotice = typeof ScopeNotice.Type;

export const REALTIME_PREFIX = "/api/realtime/";

export const realtimePath = (scope: ScopeId) => `${REALTIME_PREFIX}${scope}`;

export const SCOPE_PING = "ping";

export const SCOPE_PONG = "pong";

export const MAX_SCOPE_SOCKETS = 100;

/** Application close codes, in the range WebSocket reserves for apps. */
export const ScopeCloseCode = {
  overCapacity: 4429,
} as const;
