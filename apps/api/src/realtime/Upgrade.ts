import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import {
  CurrentUser,
  GroupId,
  REALTIME_PREFIX,
  Recorder,
  RecorderOf,
  ScopeId,
  TableId,
  type ScopeId as Scope,
  type Unauthorized,
} from "@stacks/contracts";

import { parseActor } from "../auth/Clerk.ts";
import * as Access from "../features/Access.ts";
import * as Recording from "../features/Recording.ts";

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

const Scheme = Schema.Literals(["bearer", "actor", "share"]);

const credentialOf = (request: Request) => {
  const match = /^(\w+)\s+(\S+)$/.exec(request.headers.get("authorization") ?? "");
  const scheme = Schema.decodeUnknownOption(Scheme)(match?.[1]?.toLowerCase());

  return match && Option.isSome(scheme)
    ? Option.some({ scheme: scheme.value, value: Redacted.make(match[2]!) })
    : Option.none();
};

/**
 * Authorizes a WebSocket upgrade to `/api/realtime/<scope>` and passes it on. The group GET's
 * membership check decides who may watch a group, for a signed-in account only. A table accepts
 * what the table GET does (an account, a device actor) and a share link that names that table,
 * and applies the same rules: a table that was deleted, or whose visits all were, is gone. Ids are
 * lowercased, so one scope is one channel however the client spelled it. A refusal is a plain
 * status, since a socket client can't read a body, and it's logged without the credential.
 */
export const upgrade = (request: Request, { verify, connect }: Upgrade) =>
  Effect.gen(function* () {
    if (request.method !== "GET") return yield* new Rejected({ status: 405, reason: "method" });

    const raw = rawScope(request.url);
    const scope = Option.getOrNull(Schema.decodeUnknownOption(ScopeId)(raw));

    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return yield* new Rejected({ status: 426, reason: "upgrade_required" });
    }

    if (scope === null) return yield* new Rejected({ status: 400, reason: "bad_scope" });

    const credential = credentialOf(request);

    if (Option.isNone(credential)) return yield* new Rejected({ status: 401, reason: "no_token" });
    const { scheme, value } = credential.value;

    const user = Effect.fn("Upgrade.user")(() =>
      verify(value).pipe(Effect.mapError(() => new Rejected({ status: 401, reason: "bad_token" }))),
    );

    if (scope.startsWith("group:")) {
      if (scheme !== "bearer") return yield* new Rejected({ status: 401, reason: "bad_scheme" });

      yield* Access.membership(GroupId.make(scope.slice("group:".length))).pipe(
        Effect.provideService(CurrentUser, yield* user()),
        Effect.catchTags({
          NotFound: () => Effect.fail(new Rejected({ status: 404, reason: "group_not_found" })),
          Forbidden: () => Effect.fail(new Rejected({ status: 403, reason: "not_a_member" })),
          SqlError: Effect.die,
        }),
      );
    } else {
      const tableId = TableId.make(scope.slice("table:".length));

      const view =
        scheme === "share"
          ? Recording.shared(Redacted.value(value))
          : Recording.table(tableId).pipe(
              Effect.provideService(
                Recorder,
                scheme === "bearer"
                  ? RecorderOf.Account({ user: yield* user() })
                  : RecorderOf.Actor(
                      yield* parseActor(value).pipe(
                        Effect.mapError(() => new Rejected({ status: 401, reason: "bad_actor" })),
                      ),
                    ),
              ),
            );

      const seen = yield* view.pipe(
        Effect.catchTags({
          NotFound: () => Effect.fail(new Rejected({ status: 404, reason: "table_not_found" })),
          Unauthorized: () => Effect.fail(new Rejected({ status: 401, reason: "bad_actor" })),
          SqlError: Effect.die,
        }),
      );

      if (seen.table.id.toLowerCase() !== tableId) {
        return yield* new Rejected({ status: 404, reason: "table_not_found" });
      }
    }

    return yield* Effect.promise(() => connect(scope, request));
  }).pipe(
    Effect.catchTag("Rejected", ({ status, reason }) =>
      Effect.logWarning("Realtime upgrade rejected").pipe(
        Effect.annotateLogs({ status, reason, scopeKind: kindOf(rawScope(request.url)) }),
        Effect.as(new Response(reason, { status })),
      ),
    ),
  );
