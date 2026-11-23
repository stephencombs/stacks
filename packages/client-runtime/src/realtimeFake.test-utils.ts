import { GroupId, groupScope } from "@stacks/contracts";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";

import {
  createScopeHub,
  type AppStateName,
  type RealtimeSocket,
  type ScopeListener,
  type SocketHandlers,
} from "./realtime.ts";

export const scope = groupScope(GroupId.make("0192e7a0-0000-7000-8000-000000000001"));

export const notice = JSON.stringify({ scope, origin: null });

export class Line implements RealtimeSocket {
  readonly sent: Array<string> = [];
  closed = false;
  failing = false;
  readonly url: string;
  readonly authorization: string;
  readonly handlers: SocketHandlers;

  constructor(url: string, authorization: string, handlers: SocketHandlers) {
    this.url = url;
    this.authorization = authorization;
    this.handlers = handlers;
  }

  send(data: string) {
    if (this.failing) throw new Error("socket is closing");
    this.sent.push(data);
  }

  close() {
    this.closed = true;
  }
}

export const setup = (
  options: { token?: string | null; watchable?: boolean; origin?: string } = {},
) =>
  Effect.gen(function* () {
    const lines = yield* Queue.unbounded<Line>();
    let tokens = 0;
    let state: AppStateName = "active";
    const changes = new Set<(state: AppStateName) => void>();

    const fork = Effect.runForkWith(yield* Effect.context<never>());

    const hub = createScopeHub(
      {
        baseUrl: "https://api.example.com",
        authorization: async () => (options.token === null ? null : `Bearer token-${++tokens}`),
        origin: options.origin ?? null,
        openSocket: (url, headers, handlers) => {
          const line = new Line(url, headers.authorization, handlers);
          Queue.offerUnsafe(lines, line);

          return line;
        },
        appState: {
          current: () => state,
          subscribe: (listener) => {
            changes.add(listener);

            return () => void changes.delete(listener);
          },
        },
        watchable: () => Effect.succeed(options.watchable ?? true),
      },
      fork,
    );

    const heard = { notices: 0, connections: 0 };

    const listener: ScopeListener = {
      notice: () => void (heard.notices += 1),
      connected: () => void (heard.connections += 1),
    };

    const appState = (next: AppStateName) => {
      state = next;

      for (const change of changes) change(next);
    };

    return { hub, lines, heard, listener, appState, fork };
  });
