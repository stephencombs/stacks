import {
  SCOPE_PING,
  SCOPE_PONG,
  ScopeCloseCode,
  ScopeNotice,
  type ScopeId,
} from "@stacks/contracts";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Random from "effect/Random";
import * as Schema from "effect/Schema";

/** What happens on a socket, reported by whatever opened it. */
export interface SocketHandlers {
  readonly open: () => void;
  readonly message: (data: string) => void;
  readonly close: (code: number) => void;
}

export interface RealtimeSocket {
  readonly send: (data: string) => void;
  readonly close: () => void;
}

/** Opens a WebSocket that sends these headers with its handshake and reports to `handlers`. */
export type OpenSocket = (
  url: string,
  headers: { readonly authorization: string },
  handlers: SocketHandlers,
) => RealtimeSocket;

/** Starts an effect in the background; `Effect.runFork`, or a runner that carries a test clock. */
export type Fork = <A, E>(effect: Effect.Effect<A, E>) => Fiber.Fiber<A, E>;

export type AppStateName = "active" | "background" | "inactive";

export interface AppStateSource {
  readonly current: () => AppStateName;
  readonly subscribe: (listener: (state: AppStateName) => void) => () => void;
}

export interface ScopeListener {
  /** Something in the scope changed. */
  readonly notice: () => void;
  /** The socket opened, so anything missed while it was down needs fetching. */
  readonly connected: () => void;
}

export interface ScopeHubOptions {
  /** The API origin, `http(s)://` and no path. */
  readonly baseUrl: string;
  /**
   * The `Authorization` header value for a handshake, fetched fresh for each attempt: `Bearer`,
   * `Actor` or `Share`. Null means there is nothing to connect with yet.
   */
  readonly authorization: () => Promise<string | null>;
  /** This install's `X-Origin`: a notice it caused isn't passed on. */
  readonly origin: string | null;
  readonly openSocket: OpenSocket;
  readonly appState: AppStateSource;
  /** False when the API refuses the scope's view (401, 403, 404); true for anything else. */
  readonly watchable: (scope: ScopeId) => Effect.Effect<boolean>;
}

export const PING_EVERY = Duration.seconds(30);
export const PONG_WITHIN = Duration.seconds(10);
export const MAX_BACKOFF = Duration.seconds(30);

const BASE_BACKOFF_MS = 500;

type SocketEvent =
  | { readonly kind: "open" }
  | { readonly kind: "message"; readonly data: string }
  | { readonly kind: "close"; readonly code: number };

type Outcome =
  | { readonly kind: "no_token" }
  | { readonly kind: "dropped"; readonly opened: boolean; readonly code: number | null };

type Entry = {
  readonly listeners: Set<ScopeListener>;
  fiber: Fiber.Fiber<void> | null;
  revoked: boolean;
};

const revokes = (code: number | null) =>
  code === ScopeCloseCode.revoked || code === ScopeCloseCode.tableDeleted;

const parseNotice = (data: string) => {
  try {
    return Schema.decodeUnknownOption(ScopeNotice)(JSON.parse(data));
  } catch {
    return Option.none();
  }
};

const backoff = (failures: number) =>
  Random.nextBetween(
    0,
    Math.min(Duration.toMillis(MAX_BACKOFF), BASE_BACKOFF_MS * 2 ** failures),
  ).pipe(Effect.map(Duration.millis));

const wsUrl = (baseUrl: string, scope: ScopeId) =>
  `${baseUrl.replace(/^http/, "ws")}/api/realtime/${scope}`;

/**
 * One socket per scope, shared by everything watching it. It opens with a fresh token, pings
 * every 30s and reconnects when the pong doesn't come, backing off with jitter. It closes while
 * the app is in the background and opens again when it's active. A refused view stops it, and so
 * does the server closing the socket because access was lost or the table deleted: that refetches
 * once, for the answer, and doesn't reconnect.
 */
export const createScopeHub = (options: ScopeHubOptions, fork: Fork = Effect.runFork) => {
  const entries = new Map<ScopeId, Entry>();

  const session = (scope: ScopeId, listeners: ReadonlySet<ScopeListener>) =>
    Effect.gen(function* () {
      const authorization = yield* Effect.tryPromise(options.authorization).pipe(
        Effect.catch(() => Effect.succeed(null)),
      );

      if (authorization === null) return { kind: "no_token" } satisfies Outcome;

      const events = yield* Queue.unbounded<SocketEvent>();

      const socket = options.openSocket(
        wsUrl(options.baseUrl, scope),
        { authorization },
        {
          open: () => void Queue.offerUnsafe(events, { kind: "open" }),
          message: (data) => void Queue.offerUnsafe(events, { kind: "message", data }),
          close: (code) => void Queue.offerUnsafe(events, { kind: "close", code }),
        },
      );

      const watching = Effect.gen(function* () {
        const first = yield* Queue.take(events);

        if (first.kind !== "open") {
          return {
            kind: "dropped",
            opened: false,
            code: first.kind === "close" ? first.code : null,
          } satisfies Outcome;
        }

        for (const listener of listeners) listener.connected();
        let pingAt = (yield* Clock.currentTimeMillis) + Duration.toMillis(PING_EVERY);
        let pongBy: number | null = null;

        for (;;) {
          const now = yield* Clock.currentTimeMillis;

          const next = yield* Queue.take(events).pipe(
            Effect.timeoutOption(Duration.millis(Math.max(0, (pongBy ?? pingAt) - now))),
          );

          const at = yield* Clock.currentTimeMillis;

          if (Option.isNone(next)) {
            if (pongBy !== null) {
              return { kind: "dropped", opened: true, code: null } satisfies Outcome;
            }

            const sent = yield* Effect.try(() => socket.send(SCOPE_PING)).pipe(Effect.option);

            if (Option.isNone(sent)) {
              return { kind: "dropped", opened: true, code: null } satisfies Outcome;
            }

            pongBy = at + Duration.toMillis(PONG_WITHIN);
            continue;
          }

          const event = next.value;

          if (event.kind === "close") {
            return { kind: "dropped", opened: true, code: event.code } satisfies Outcome;
          }

          if (event.kind === "message") {
            pongBy = null;
            pingAt = at + Duration.toMillis(PING_EVERY);

            const heard = event.data === SCOPE_PONG ? Option.none() : parseNotice(event.data);

            const own =
              Option.isSome(heard) &&
              options.origin !== null &&
              heard.value.origin === options.origin;

            if (Option.isSome(heard) && !own) {
              for (const listener of listeners) listener.notice();
            }
          }
        }
      });

      return yield* watching.pipe(
        Effect.ensuring(
          Effect.sync(() => {
            try {
              socket.close();
            } catch {}
          }),
        ),
      );
    });

  const run = (scope: ScopeId, listeners: ReadonlySet<ScopeListener>) =>
    Effect.gen(function* () {
      let failures = 0;

      for (;;) {
        const outcome = yield* session(scope, listeners);

        if (outcome.kind === "no_token") return false;

        if (revokes(outcome.code)) {
          for (const listener of listeners) listener.notice();

          return true;
        }

        if (!outcome.opened && !(yield* options.watchable(scope))) return false;

        failures = outcome.opened ? 0 : failures + 1;

        yield* Effect.sleep(
          outcome.code === ScopeCloseCode.overCapacity ? MAX_BACKOFF : yield* backoff(failures),
        );
      }
    });

  const open = (scope: ScopeId, entry: Entry) => {
    let started: Fiber.Fiber<void> | undefined;

    started = fork(
      run(scope, entry.listeners).pipe(
        Effect.map((revoked) => {
          entry.revoked = revoked;
        }),
        Effect.ensuring(
          Effect.sync(() => {
            if (entry.fiber === started) entry.fiber = null;
          }),
        ),
      ),
    );
    entry.fiber = started;
  };

  const close = (entry: Entry) => {
    const { fiber } = entry;
    entry.fiber = null;

    if (fiber) fork(Fiber.interrupt(fiber));
  };

  let stopWatchingAppState: (() => void) | null = null;

  const watchAppState = () => {
    stopWatchingAppState ??= options.appState.subscribe((state) => {
      if (state === "background") {
        for (const entry of entries.values()) close(entry);
      } else if (state === "active") {
        for (const [scope, entry] of entries) {
          if (entry.fiber === null && !entry.revoked) open(scope, entry);
        }
      }
    });
  };

  const ignoreAppState = () => {
    stopWatchingAppState?.();
    stopWatchingAppState = null;
  };

  return {
    watch: (scope: ScopeId, listener: ScopeListener) => {
      const entry = entries.get(scope) ?? {
        listeners: new Set<ScopeListener>(),
        fiber: null,
        revoked: false,
      };

      entries.set(scope, entry);
      entry.listeners.add(listener);
      entry.revoked = false;
      watchAppState();

      if (entry.fiber === null && options.appState.current() !== "background") {
        open(scope, entry);
      }

      return () => {
        entry.listeners.delete(listener);

        if (entry.listeners.size === 0) {
          close(entry);
          entries.delete(scope);

          if (entries.size === 0) ignoreAppState();
        }
      };
    },
    dispose: () => {
      ignoreAppState();

      for (const entry of entries.values()) close(entry);
      entries.clear();
    },
  };
};

export type ScopeHub = ReturnType<typeof createScopeHub>;
