// @vitest-environment happy-dom
import { makeOutbox } from "@stacks/client-runtime/outbox";
import { EntryId, MinorUnits, PlayerId, SessionId } from "@stacks/contracts";
import {
  RouterProvider,
  createMemoryHistory,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import * as DateTime from "effect/DateTime";
import { act, useEffect, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { Route as root } from "~/routes/__root";

type Account = {
  available: true;
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  userId: string | null | undefined;
};

const account = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let current: Account = { available: true, isLoaded: false, isSignedIn: undefined, userId: null };
  return {
    get: () => current,
    set: (next: Account) => {
      current = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
});

vi.mock("@clerk/react", () => import("../preview/clerk-stub"));
vi.mock("~/lib/account", () => ({
  useAccount: () => useSyncExternalStore(account.subscribe, account.get),
}));

const LOADING: Account = { available: true, isLoaded: false, isSignedIn: undefined, userId: null };
const SIGNED_IN: Account = { available: true, isLoaded: true, isSignedIn: true, userId: "user-1" };

let mounts = 0;
function YourPlay() {
  useEffect(() => void mounts++, []);
  return <main>Your play</main>;
}
const tree = root.addChildren([
  createRoute({ getParentRoute: () => root, path: "/", component: YourPlay }),
]);

const roots: ReturnType<typeof createRoot>[] = [];
async function open(path: string) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const host = document.createElement("div");
  const view = createRoot(host);
  roots.push(view);
  await act(async () => view.render(<RouterProvider router={router} />));
  return host;
}

afterEach(() => {
  for (const view of roots.splice(0)) act(() => view.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
  mounts = 0;
  account.set(LOADING);
});

/** A buy-in logged on a group session with no signal, still waiting in user-1's outbox. */
function queueBuyIn() {
  const sessionId = SessionId.make("0192e7a0-0000-7000-8000-000000000001");
  const outbox = makeOutbox(
    {
      load: () => localStorage.getItem("stacks-outbox-user-1"),
      save: (value) => localStorage.setItem("stacks-outbox-user-1", value),
    },
    async () => ({ error: new Error("fetch failed") }),
  );
  void outbox.add(sessionId, {
    id: EntryId.make("0192e7a0-0000-7000-8000-000000000003"),
    kind: "buy_in",
    playerId: PlayerId.make("0192e7a0-0000-7000-8000-000000000002"),
    counterpartyId: null,
    amount: MinorUnits.make(50000),
    occurredAt: DateTime.makeUnsafe(Date.UTC(2026, 9, 24, 2)),
    note: null,
    replacesEntryId: null,
  });
  return `/api/sessions/${sessionId}/entries`;
}

/** No signal: every request fails, and each attempt is announced as it happens. */
function offline() {
  const sent: string[] = [];
  let announce = () => {};
  const attempt = () =>
    new Promise<void>((resolve) => {
      announce = resolve;
    });
  let next = attempt();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      sent.push(new URL(input instanceof Request ? input.url : input, location.href).pathname);
      announce();
      next = attempt();
      throw new TypeError("Failed to fetch");
    }),
  );
  return { sent, attempted: () => next };
}

it("shows your play while sign-in loads, and keeps it in place once you're signed in", async () => {
  const network = offline();
  const host = await open("/");
  expect(host.textContent).toBe("Your play");
  const page = host.querySelector("main");

  await act(async () => account.set(SIGNED_IN));
  expect(host.querySelector("main")).toBe(page);
  expect(mounts).toBe(1);
  // Nothing was waiting to send, so being signed in on your play asks nothing of the API.
  expect(network.sent).toEqual([]);
});

it("keeps retrying a signed-in buy-in that's waiting for signal while you're on your play", async () => {
  const entries = queueBuyIn();
  account.set(SIGNED_IN);
  const network = offline();
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });

  const first = network.attempted();
  const host = await open("/");
  expect(host.textContent).toBe("Your play");
  await act(() => first);
  expect(network.sent).toEqual([entries]);

  const second = network.attempted();
  await act(async () => vi.advanceTimersByTime(15_000));
  await act(() => second);
  expect(network.sent).toEqual([entries, entries]);
});
