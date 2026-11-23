import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import {
  ORIGIN_HEADER,
  OriginId,
  scopeKind,
  type ScopeCloseCode,
  type ScopeId,
  type ScopeNotice,
} from "@stacks/contracts";

import type { Selector } from "../realtime/Selector.ts";

/** Sockets in a scope that lost access, to be closed with `code`. */
export interface Close {
  readonly scope: ScopeId;
  readonly selector: Selector;
  readonly code: (typeof ScopeCloseCode)[keyof typeof ScopeCloseCode];
}

/** The scopes this request changed and the sockets it revoked, waiting for the handler to finish. */
export class Realtime extends Context.Service<
  Realtime,
  {
    readonly origin: string | null;
    readonly queue: (scope: ScopeId) => void;
    readonly queued: () => ReadonlyArray<ScopeId>;
    readonly queueClose: (close: Close) => void;
    readonly closes: () => ReadonlyArray<Close>;
  }
>()("@stacks/api/Realtime") {}

export const makeRealtime = (origin: string | null = null) => {
  const scopes = new Set<ScopeId>();
  const closes = new Map<string, Close>();

  return Realtime.of({
    origin,
    queue: (scope) => void scopes.add(scope),
    queued: () => Array.from(scopes),
    queueClose: (close) => void closes.set(JSON.stringify(close), close),
    closes: () => Array.from(closes.values()),
  });
};

/** The caller's `X-Origin`, or null when it sent none or one that isn't a short plain id. */
export const originOf = (headers: Headers) =>
  Option.getOrNull(Schema.decodeUnknownOption(OriginId)(headers.get(ORIGIN_HEADER)));

const Staged = Context.Reference<ReturnType<typeof makeRealtime> | null>(
  "@stacks/api/Realtime/Staged",
  { defaultValue: () => null },
);

/**
 * A row in the scope changed. Call it after the statement that changed it succeeded, and only
 * when it did change one (`returning`): a replay queues nothing. Inside `transaction` it waits
 * for the commit.
 */
export const changed = Effect.fn("Realtime.changed")(function* (scope: ScopeId) {
  const staged = yield* Staged;

  if (staged) staged.queue(scope);
  else (yield* Realtime).queue(scope);
});

/**
 * Whoever the selector names lost access to the scope, so their sockets close. Queued like
 * `changed`. A socket that still has access just reconnects, so over-closing costs a handshake;
 * missing one lets it keep hearing when things happen.
 */
export const closed = Effect.fn("Realtime.closed")(function* (close: Close) {
  const staged = yield* Staged;

  if (staged) staged.queueClose(close);
  else (yield* Realtime).queueClose(close);
});

/** A SQL transaction whose `changed` and `closed` calls are queued only once it commits. */
export const transaction = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const realtime = yield* Realtime;
    const staged = makeRealtime();
    const result = yield* sql.withTransaction(Effect.provideService(effect, Staged, staged));

    for (const scope of staged.queued()) realtime.queue(scope);

    for (const close of staged.closes()) realtime.queueClose(close);

    return result;
  });

/** Reaches whoever watches a scope. A failure costs freshness only, so the flush logs it and goes on. */
export interface Dispatch {
  readonly notify: (notice: ScopeNotice) => Promise<void>;
  readonly close: (close: Close) => Promise<void>;
  readonly waitUntil: (work: Promise<unknown>) => void;
}

const logged = (scope: ScopeId, what: string) =>
  Effect.catchCause((cause: unknown) =>
    Effect.logWarning(what, cause).pipe(Effect.annotateLogs({ scopeKind: scopeKind(scope) })),
  );

const flush = (realtime: Realtime["Service"], { notify, close }: Dispatch) =>
  Effect.forEach(
    [
      ...realtime
        .queued()
        .map((scope) =>
          Effect.tryPromise(() => notify({ scope, origin: realtime.origin })).pipe(
            logged(scope, "Realtime notice failed"),
          ),
        ),
      ...realtime
        .closes()
        .map((request) =>
          Effect.tryPromise(() => close(request)).pipe(
            logged(request.scope, "Realtime close failed"),
          ),
        ),
    ],
    (send) => send,
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
        Effect.sync(() => dispatch.waitUntil(Effect.runPromise(flush(realtime, dispatch)))),
      ),
    );
  });
