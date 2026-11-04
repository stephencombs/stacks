// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

it("shows a startup error and retry when App fails before its providers mount", async () => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const registerRootComponent = vi.fn<(component: () => ReactNode) => void>();
  const reloadAppAsync = vi.fn();
  vi.doMock("expo", () => ({ registerRootComponent, reloadAppAsync }));
  vi.doMock("./src/polyfills", () => ({}));
  vi.doMock("./global.css", () => ({}));
  vi.doMock("./src/App", () => ({
    default: () => {
      throw new Error("Native font loader failed");
    },
  }));
  const Container = ({ children }: { children: ReactNode }) => createElement("div", null, children);
  vi.doMock("react-native", () => ({
    View: Container,
    Text: Container,
    Pressable: ({ children, onPress }: { children: ReactNode; onPress: () => void }) =>
      createElement("button", { onClick: onPress }, children),
    Platform: { OS: "ios" },
    PlatformColor: (name: string) => name,
  }));
  await import("./index");
  const Startup = registerRootComponent.mock.calls[0]![0];
  const container = document.createElement("div");
  const root = createRoot(container, { onUncaughtError: vi.fn(), onCaughtError: vi.fn() });
  try {
    await act(async () => root.render(createElement(Startup)));
    expect(container.textContent).toContain("Color Up couldn't start");
    expect(container.textContent).toContain("Native font loader failed");
    const retry = container.querySelector("button");
    expect(retry?.textContent).toBe("Try again");
    await act(async () => retry?.click());
    expect(reloadAppAsync).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
