import { createScopeHub, type SocketHandlers } from "@stacks/client-runtime/realtime";
import { RootScopeHub, useScopeNotices } from "@stacks/client-runtime/realtimeReact";
import { TableId, tableScope } from "@stacks/contracts";
import * as Effect from "effect/Effect";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

class Line {
  readonly authorization: string;
  readonly handlers: SocketHandlers;
  readonly closing = Promise.withResolvers<void>();

  constructor(authorization: string, handlers: SocketHandlers) {
    this.authorization = authorization;
    this.handlers = handlers;
  }

  send() {}

  close() {
    this.closing.resolve();
  }
}

const arrivals: Array<(line: Line) => void> = [];

const nextLine = () => new Promise<Line>((resolve) => arrivals.push(resolve));

const makeHub = (authorization: () => Promise<string | null>) =>
  createScopeHub({
    baseUrl: "https://api.example.com",
    authorization,
    origin: null,
    openSocket: (_url, headers, handlers) => {
      const line = new Line(headers.authorization, handlers);
      arrivals.shift()?.(line);

      return line;
    },
    appState: { current: () => "active", subscribe: () => () => {} },
    watchable: () => Effect.succeed(true),
  });

const scope = tableScope(TableId.make("0192e7a0-0000-7000-8000-0000000000a1"));

function Watcher() {
  useScopeNotices([scope], true);

  return null;
}

const bearer = async () => "Bearer session";
const actor = async () => "Actor device.secret";

it("reconnects with the new credential when who is signed in changes, closing the old socket", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));

  const render = (userId: string | null) => (
    <RootScopeHub userId={userId} bearer={bearer} actor={actor} make={makeHub}>
      <Watcher />
    </RootScopeHub>
  );

  try {
    const first = nextLine();
    await act(async () => root.render(render(null)));
    const asDevice = await first;
    expect(asDevice.authorization).toBe("Actor device.secret");

    const second = nextLine();
    await act(async () => root.render(render("user_1")));
    const asAccount = await second;
    expect(asAccount.authorization).toBe("Bearer session");
    await asDevice.closing.promise;

    const third = nextLine();
    await act(async () => root.render(render(null)));
    const again = await third;
    expect(again.authorization).toBe("Actor device.secret");
    await asAccount.closing.promise;
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
