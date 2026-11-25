import type { AccountWipe } from "../lib/accountDeletion";
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";

const mount = async (wipe: AccountWipe, { os = "ios" }: { os?: string } = {}) => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const reload = vi.fn();
  const continueWipe = vi.fn();
  const finishWipe = vi.fn();
  const Plain = ({ children }: { children?: ReactNode }) => createElement("div", null, children);

  vi.doMock("react-native", () => ({ Platform: { OS: os }, View: Plain }));
  vi.doMock("expo", () => ({ reloadAppAsync: reload }));
  vi.doMock("../components/ui/Text", () => ({ Text: Plain }));
  vi.doMock("../components/ui/Button", () => ({
    Button: ({ label, onPress }: { label: string; onPress: () => void }) =>
      createElement("button", { onClick: onPress }, label),
  }));
  vi.doMock("../lib/accountDeletion", () => ({
    continueAccountWipe: continueWipe,
    finishAccountWipe: finishWipe,
  }));

  const { AccountWipeScreen } = await import("./AccountWipeScreen");
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(createElement(AccountWipeScreen, { wipe })));

  return {
    text: () => container.textContent ?? "",
    press: (label: string) =>
      act(async () =>
        [...container.querySelectorAll("button")]
          .find((button) => button.textContent === label)
          ?.click(),
      ),
    reload,
    continueWipe,
    finishWipe,
    unmount: () => act(async () => root.unmount()),
  };
};

const wipe = (stage: AccountWipe["stage"], overrides: Partial<AccountWipe["wipe"]> = {}) =>
  ({
    stage,
    wipe: { userId: "user_alice", status: "complete", appleManual: false, ...overrides },
  }) satisfies AccountWipe;

afterEach(() => vi.unstubAllGlobals());

it("starts a wipe that is waiting, and signs out once the files are gone", async () => {
  const waiting = await mount(wipe("waiting"));

  expect(waiting.continueWipe).toHaveBeenCalledTimes(1);
  expect(waiting.text()).toContain("Clearing your data from this phone");
  await waiting.unmount();

  const ready = await mount(wipe("signing_out"));
  expect(ready.finishWipe).toHaveBeenCalledTimes(1);
  await ready.unmount();
});

it("says what's finished, and Done restarts the app signed out", async () => {
  const screen = await mount(wipe("done"));

  expect(screen.text()).toContain("Your account and the data on this phone are gone.");
  expect(screen.text()).not.toContain("Apple");

  await screen.press("Done");

  expect(screen.reload).toHaveBeenCalledTimes(1);
  await screen.unmount();
});

it("tells someone whose sign-in record is still being deleted that it will finish shortly", async () => {
  const screen = await mount(wipe("done", { status: "pending" }));

  expect(screen.text()).toContain("sign-in record will finish deleting shortly");
  await screen.unmount();
});

it("shows how to remove Color Up from the Apple Account after a skipped Apple sheet", async () => {
  const ios = await mount(wipe("done", { appleManual: true }));
  expect(ios.text()).toContain("open Settings, tap your name, then Sign in with Apple");
  await ios.unmount();

  const android = await mount(wipe("done", { appleManual: true }), { os: "android" });
  expect(android.text()).toContain("sign in at account.apple.com");
  await android.unmount();
});

it("explains a wipe another device started", async () => {
  const screen = await mount(wipe("done", { status: "unknown" }));

  expect(screen.text()).toContain("This account was deleted");
  await screen.unmount();
});

it("offers another try when something on the phone wouldn't clear", async () => {
  const screen = await mount(wipe("failed"));

  expect(screen.text()).toContain("Couldn't finish clearing this phone");

  await screen.press("Try again");

  expect(screen.continueWipe).toHaveBeenCalledTimes(1);
  await screen.unmount();
});
