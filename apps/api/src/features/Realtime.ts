import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import {
  ORIGIN_HEADER,
  OriginId,
  scopeKind,
  type ScopeId,
  type ScopeNotice,
} from "@stacks/contracts";

/** The scopes this request changed, waiting for the handler to finish, and who asked. */
export class Realtime extends Context.Service<
  Realtime,
  {
    readonly origin: string | null;
    readonly queue: (scope: ScopeId) => void;
    readonly queued: () => ReadonlyArray<ScopeId>;
  }
>()("@stacks/api/Realtime") {}

export const makeRealtime = (origin: string | null = null) => {
  const scopes = new Set<ScopeId>();

  return Realtime.of({
    origin,
    queue: (scope) => void scopes.add(scope),
    queued: () => Array.from(scopes),
  });
};

/** The caller's `X-Origin`, or null when it sent none or one that isn't a short plain id. */
export const originOf = (headers: Headers) =>
  Option.getOrNull(Schema.decodeUnknownOption(OriginId)(headers.get(ORIGIN_HEADER)));

const Staged = Context.Reference<Set<ScopeId> | null>("@stacks/api/Realtime/Staged", {
  defaultValue: () => null,
});

/**
 * A row in the scope changed. Call it after the statement that changed it succeeded, and only
 * when it did change one (`returning`): a replay queues nothing. Inside `transaction` it waits
 * for the commit.
 */
export const changed = Effect.fn("Realtime.changed")(function* (scope: ScopeId) {
  const staged = yield* Staged;

  if (staged) staged.add(scope);
  else (yield* Realtime).queue(scope);
});

/** A SQL transaction whose `changed` scopes are queued only once it commits. */
export const transaction = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const realtime = yield* Realtime;
    const staged = new Set<ScopeId>();
    const result = yield* sql.withTransaction(Effect.provideService(effect, Staged, staged));

    for (const scope of staged) realtime.queue(scope);

    return result;
  });

/** Tells whoever watches the scope. Failing costs freshness only, so callers log and go on. */
export type Notify = (notice: ScopeNotice) => Promise<void>;

export interface Dispatch {
  readonly notify: Notify;
  readonly waitUntil: (work: Promise<unknown>) => void;
}

const flush = (realtime: Realtime["Service"], notify: Notify) =>
  Effect.forEach(
    realtime.queued(),
    (scope) =>
      Effect.tryPromise(() => notify({ scope, origin: realtime.origin })).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Realtime notice failed", cause).pipe(
            Effect.annotateLogs({ scopeKind: scopeKind(scope) }),
          ),
        ),
      ),
    { concurrency: "unbounded", discard: true },
  );

/**
 * Runs one request with a fresh queue and sends what it queued once it finishes, whatever the
 * status: a write can commit and the response still fail.
 */
export const withRealtime = <A, E, R>(
  dispatch: Dispatch,
  origin: string | null,
  run: (realtime: Realtime["Service"]) => Effect.Effect<A, E, R>,
) =>
  Effect.suspend(() => {
    const realtime = makeRealtime(origin);

    return run(realtime).pipe(
      Effect.ensuring(
        Effect.sync(() => dispatch.waitUntil(Effect.runPromise(flush(realtime, dispatch.notify)))),
      ),
    );
  });
