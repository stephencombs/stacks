import * as Schema from "effect/Schema";

import type { GroupId, TableId } from "./ids.ts";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** What a change notice is about: `group:<groupId>` or `table:<tableId>`. */
export const ScopeId = Schema.String.check(
  Schema.isPattern(new RegExp(`^(group|table):${UUID}$`, "i")),
).pipe(Schema.brand("ScopeId"));

export type ScopeId = typeof ScopeId.Type;

/** Lowercased: a Durable Object is named by the exact string, and ids arrive in either case. */
export const groupScope = (groupId: GroupId) => ScopeId.make(`group:${groupId.toLowerCase()}`);

/** Lowercased for the same reason as `groupScope`. */
export const tableScope = (tableId: TableId) => ScopeId.make(`table:${tableId.toLowerCase()}`);

export const scopeKind = (scope: ScopeId) => (scope.startsWith("group:") ? "group" : "table");

/** The request header a client names itself with: a random id per install, not a secret. */
export const ORIGIN_HEADER = "x-origin";

/** How the Worker hands a socket's revocation tags to the object that holds it. Never sent by a client. */
export const TAGS_HEADER = "x-scope-tags";

export const OriginId = Schema.String.check(Schema.isPattern(/^[\w-]{1,64}$/));

/**
 * Something in the scope changed. It carries no ledger data: whoever hears it refetches through
 * the API. `origin` is the `X-Origin` of the request that wrote, so a client can skip its own echo.
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
  /** Access to the scope was lost. The client refetches once, then stops watching it. */
  revoked: 4403,
  /** The table is gone. The client treats it like `revoked`. */
  tableDeleted: 4404,
  overCapacity: 4429,
} as const;
