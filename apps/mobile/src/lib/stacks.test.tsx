// @vitest-environment happy-dom
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Atom from "effect/reactivity/Atom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

it("marks when the first account query starts as well as when it settles", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let result: AsyncResult.AsyncResult<string, never> = AsyncResult.initial();
  const listeners = new Set<() => void>();
  const markStartup = vi.fn();
  vi.doMock("./diagnostics", () => ({ markStartup }));
  vi.doMock("@effect/atom-react", async () => {
    const { useSyncExternalStore } = await import("react");
    return {
      useAtomValue: () =>
        useSyncExternalStore(
          (listener) => {
            listeners.add(listener);
            return () => void listeners.delete(listener);
          },
          () => result,
        ),
    };
  });
  vi.doMock("@stacks/client-runtime/react", () => ({ useRevalidate: () => {} }));
  vi.doMock("@clerk/expo", () => ({ getClerkInstance: vi.fn() }));
  vi.doMock("@stacks/client-runtime/api", () => ({}));
  vi.doMock("@stacks/client-runtime/recordingReact", () => ({}));
  vi.doMock("expo-haptics", () => ({}));
  vi.doMock("react-native", () => ({ AppState: {}, Platform: { OS: "ios" } }));
  vi.doMock("../components/ui/Field", () => ({}));
  vi.doMock("../components/ui/Surface", () => ({ Skeleton: () => null }));
  vi.doMock("./account", () => ({}));
  vi.doMock("./actorKeys", () => ({}));
  vi.doMock("./config", () => ({ apiUrl: "", clerkPublishableKey: "" }));
  vi.doMock("./outbox", () => ({}));
  vi.doMock("./telemetry", () => ({}));
  vi.doMock("./tripStorage", () => ({}));
  const { Loaded } = await import("./stacks");
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<Loaded query={Atom.make(result)}>{(value) => value}</Loaded>),
    );
    expect(markStartup.mock.calls).toEqual([["query_started"]]);
    await act(async () => {
      result = AsyncResult.success("Vegas");
      listeners.forEach((listener) => listener());
    });
    expect(container.textContent).toBe("Vegas");
    expect(markStartup.mock.calls).toEqual([["query_started"], ["query_settled"]]);
  } finally {
    await act(async () => root.unmount());
  }
});
