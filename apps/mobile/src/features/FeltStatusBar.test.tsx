// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

async function render(options: { os: string; focused: boolean; felt: boolean }) {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.doMock("react-native", () => ({ Platform: { OS: options.os } }));
  vi.doMock("@react-navigation/native", () => ({ useIsFocused: () => options.focused }));
  vi.doMock("expo-status-bar", () => ({
    StatusBar: ({ style }: { style: string }) => <i data-status={style} />,
  }));
  const { FeltStatusBar } = await import("./FeltStatusBar");
  const element = document.createElement("div");
  const root = createRoot(element);
  await act(async () => root.render(<FeltStatusBar felt={options.felt} />));

  return element.querySelector("i")?.getAttribute("data-status") ?? null;
}

it("draws light status-bar icons on the felt, but only while the felt is the screen you see", async () => {
  expect(await render({ os: "android", focused: true, felt: true })).toBe("light");
  expect(await render({ os: "ios", focused: true, felt: true })).toBe("light");
  // A screen pushed over the felt leaves it mounted; its icons must follow the theme again.
  expect(await render({ os: "android", focused: false, felt: true })).toBeNull();
  expect(await render({ os: "ios", focused: false, felt: true })).toBeNull();
});

it("leaves the bar alone off the felt", async () => {
  expect(await render({ os: "android", focused: true, felt: false })).toBeNull();
  expect(await render({ os: "ios", focused: true, felt: false })).toBeNull();
});
