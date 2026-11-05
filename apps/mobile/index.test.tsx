// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

it("shows a startup error and retry when App fails before its providers mount", async () => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const registerRootComponent = vi.fn<(component: () => ReactNode) => void>();
  const reloadAppAsync = vi.fn();
  const configure = vi.fn();
  const reportError = vi.fn();
  vi.doMock("expo-observe", () => ({
    Observe: { configure, logEvent: vi.fn(), reportError },
    ObserveRoot: { wrap: (component: () => ReactNode) => component },
  }));
  vi.doMock("expo-constants", () => ({ default: {} }));
  vi.doMock("./src/lib/telemetry", () => ({
    captureStartup: vi.fn(),
    captureCaughtError: vi.fn(),
  }));
  vi.stubGlobal("__DEV__", true);
  vi.doMock("expo", () => ({ registerRootComponent, reloadAppAsync }));
  vi.doMock("./src/polyfills", () => ({}));
  vi.doMock("./global.css", () => ({}));
  let appLoaded = false;
  vi.doMock("./src/App", () => {
    appLoaded = true;
    expect(configure).toHaveBeenCalledOnce();
    return {
      default: () => {
        throw new Error("Native font loader failed");
      },
    };
  });
  const Container = ({ children }: { children: ReactNode }) => createElement("div", null, children);
  vi.doMock("react-native", () => ({
    View: Container,
    Text: Container,
    ScrollView: Container,
    Pressable: ({ children, onPress }: { children: ReactNode; onPress: () => void }) =>
      createElement("button", { onClick: onPress }, children),
    Platform: { OS: "ios" },
    PlatformColor: (name: string) => name,
  }));
  await import("./index");
  expect(appLoaded).toBe(false);
  const Startup = registerRootComponent.mock.calls[0]![0];
  const container = document.createElement("div");
  const root = createRoot(container, { onUncaughtError: vi.fn(), onCaughtError: vi.fn() });
  try {
    await act(async () => root.render(createElement(Startup)));
    expect(container.textContent).toContain("Opening Color Up…");
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(container.textContent).toContain("Color Up couldn't start");
    expect(container.textContent).toContain("Native font loader failed");
    expect(container.textContent).toContain("Component stack:");
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Native font loader failed",
        stack: expect.stringContaining("Component stack:"),
      }),
    );
    const retry = container.querySelector("button");
    expect(retry?.textContent).toBe("Try again");
    await act(async () => retry?.click());
    expect(reloadAppAsync).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
