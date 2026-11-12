// @vitest-environment happy-dom
import { RegistryContext } from "@effect/atom-react";
import * as Effect from "effect/Effect";
import * as Atom from "effect/reactivity/Atom";
import * as AtomRegistry from "effect/reactivity/AtomRegistry";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { Loaded } from "./stacks";

vi.mock("@clerk/react", () => ({ getToken: vi.fn() }));
vi.mock("./account", () => ({ useAccount: vi.fn() }));
vi.mock("./telemetry", () => ({ captureTestEvent: vi.fn() }));

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.unstubAllGlobals();
});

async function open() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const registry = AtomRegistry.make();
  let attempts = 0;
  let complete: (effect: Effect.Effect<string, string>) => void = () => {};
  const query = Atom.make(
    Effect.callback<string, string>((resume) => {
      attempts++;
      complete = resume;
    }),
  );
  const host = document.createElement("div");
  const root = createRoot(host);
  cleanups.push(() => {
    act(() => root.unmount());
    registry.dispose();
  });
  await act(async () =>
    root.render(
      <RegistryContext value={registry}>
        <Loaded query={query}>{(value) => <span>{value}</span>}</Loaded>
      </RegistryContext>,
    ),
  );
  return {
    host,
    query,
    registry,
    attempts: () => attempts,
    finish: (effect: Effect.Effect<string, string>) => act(async () => complete(effect)),
    retry: () =>
      act(async () => {
        const button = host.querySelector("button");
        expect(button, "retry is available").not.toBeNull();
        button!.click();
        button!.click();
      }),
  };
}

it("lets an initial failure retry once while pending, then replaces the error with its data", async () => {
  const page = await open();
  await page.finish(Effect.fail("offline"));
  expect(page.host.querySelector('[role="alert"]')?.textContent).toContain(
    "couldn't complete that request",
  );
  await page.retry();
  expect(page.attempts()).toBe(2);
  expect(page.host.querySelector("button")?.disabled).toBe(true);
  await page.finish(Effect.succeed("Recovered board"));
  expect(page.host.textContent).toContain("Recovered board");
  expect(page.host.querySelector("button")).toBeNull();
});

it("keeps stale data visible with a notice until retry recovers", async () => {
  const page = await open();
  await page.finish(Effect.succeed("Old board"));
  await act(async () => page.registry.refresh(page.query));
  await page.finish(Effect.fail("offline"));
  expect(page.host.textContent).toContain("Old board");
  expect(page.host.textContent).toContain("Couldn't update");
  await page.retry();
  expect(page.host.textContent).toContain("Old board");
  expect(page.attempts()).toBe(3);
  await page.finish(Effect.succeed("New board"));
  expect(page.host.textContent).toContain("New board");
  expect(page.host.textContent).not.toContain("Old board");
  expect(page.host.textContent).not.toContain("Couldn't update");
});
