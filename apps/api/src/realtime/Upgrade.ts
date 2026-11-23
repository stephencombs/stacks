import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import {
  CurrentUser,
  GroupId,
  REALTIME_PREFIX,
  ScopeId,
  type ScopeId as Scope,
  type Unauthorized,
} from "@stacks/contracts";

import * as Access from "../features/Access.ts";

class Rejected extends Schema.TaggedError<Rejected>()("Rejected", {
  status: Schema.Number,
  reason: Schema.String,
}) {}

export interface Upgrade {
  /** Checks a Clerk session token. */
  readonly verify: (
    credential: Redacted.Redacted,
  ) => Effect.Effect<CurrentUser["Service"], Unauthorized>;
  /** Hands an authorized upgrade to the scope's Durable Object. */
  readonly connect: (scope: Scope, request: Request) => Promise<Response>;
}

export const isUpgradePath = (url: string) => new URL(url).pathname.startsWith(REALTIME_PREFIX);

const rawScope = (url: string) =>
  new URL(url).pathname.slice(REALTIME_PREFIX.length).replaceAll(/%3a/gi, ":").toLowerCase();

const kindOf = (raw: string) =>
  raw.startsWith("group:") ? "group" : raw.startsWith("table:") ? "table" : "unknown";

const bearer = (request: Request) => {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");

  return match ? Option.some(Redacted.make(match[1]!)) : Option.none();
};

/**
 * Authorizes a WebSocket upgrade to `/api/realtime/<scope>` and passes it on. Only group scopes
 * exist so far, and the group GET's membership check decides who may watch one. Ids are lowercased,
 * so one group is one channel however the client spelled it. A refusal is a plain status, since a socket client can't read a body, and it's logged without the credential.
 */
export const upgrade = (request: Request, { verify, connect }: Upgrade) =>
  Effect.gen(function* () {
    if (request.method !== "GET") return yield* new Rejected({ status: 405, reason: "method" });

    const raw = rawScope(request.url);
    const scope = Option.getOrNull(Schema.decodeUnknownOption(ScopeId)(raw));

    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return yield* new Rejected({ status: 426, reason: "upgrade_required" });
    }

    if (scope === null || !scope.startsWith("group:")) {
      return yield* new Rejected({ status: 400, reason: "bad_scope" });
    }

    const credential = bearer(request);

    if (Option.isNone(credential)) return yield* new Rejected({ status: 401, reason: "no_token" });

    const user = yield* verify(credential.value).pipe(
      Effect.mapError(() => new Rejected({ status: 401, reason: "bad_token" })),
    );

    yield* Access.membership(GroupId.make(scope.slice("group:".length))).pipe(
      Effect.provideService(CurrentUser, user),
      Effect.catchTags({
        NotFound: () => Effect.fail(new Rejected({ status: 404, reason: "group_not_found" })),
        Forbidden: () => Effect.fail(new Rejected({ status: 403, reason: "not_a_member" })),
        SqlError: Effect.die,
      }),
    );

    return yield* Effect.promise(() => connect(scope, request));
  }).pipe(
    Effect.catchTag("Rejected", ({ status, reason }) =>
      Effect.logWarning("Realtime upgrade rejected").pipe(
        Effect.annotateLogs({ status, reason, scopeKind: kindOf(rawScope(request.url)) }),
        Effect.as(new Response(reason, { status })),
      ),
    ),
  );
