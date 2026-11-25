import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";

class ClerkError extends Error {
  readonly errors = [{ code: "sign_up_restricted_waitlist" }];
}

type Flow = {
  createdSessionId: string | null;
  setActive?: (params: { session: string }) => Promise<void>;
  signUp?: { status: string };
};

const render = async ({
  os = "ios",
  account = { available: true, isLoaded: true },
  available = true,
  flow,
}: {
  os?: string;
  account?: { available: boolean; isLoaded?: boolean };
  available?: boolean;
  flow?: () => Promise<Flow>;
} = {}) => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const startAppleAuthenticationFlow = vi.fn(flow ?? (async () => ({ createdSessionId: null })));
  let press: (() => void) | undefined;

  vi.doMock("@clerk/expo", () => ({
    isClerkAPIResponseError: (error: Error) => error instanceof ClerkError,
  }));
  vi.doMock("@clerk/expo/apple", () => ({
    useSignInWithApple: () => ({ startAppleAuthenticationFlow }),
  }));
  vi.doMock("expo-apple-authentication", () => ({
    isAvailableAsync: () => Promise.resolve(available),
    AppleAuthenticationButtonType: { CONTINUE: 1 },
    AppleAuthenticationButtonStyle: { WHITE: 0, BLACK: 2 },
    AppleAuthenticationButton: ({
      onPress,
      buttonStyle,
    }: {
      onPress: () => void;
      buttonStyle: number;
    }) => {
      press = onPress;

      return createElement("div", { "data-apple": buttonStyle });
    },
  }));
  vi.doMock("uniwind", () => ({ useUniwind: () => ({ theme: "light" }) }));
  vi.doMock("react-native", () => ({
    Platform: { OS: os },
    View: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  }));
  vi.doMock("../lib/account", () => ({ useAccount: () => account }));
  vi.doMock("../components/ui/Field", () => ({
    FormError: ({ children }: { children?: ReactNode }) =>
      createElement("p", { role: "alert" }, children),
  }));

  const { AppleSignInButton } = await import("./AppleSignInButton");
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(createElement(AppleSignInButton)));

  return {
    container,
    startAppleAuthenticationFlow,
    tap: () => act(async () => press?.()),
    alert: () => container.querySelector("[role='alert']")?.textContent ?? null,
    unmount: () => act(async () => root.unmount()),
  };
};

afterEach(() => vi.unstubAllGlobals());

it("renders only on iOS, with Clerk loaded, where Apple sign-in is available", async () => {
  const shown = await render();
  expect(shown.container.querySelector("[data-apple]")?.getAttribute("data-apple")).toBe("2");
  await shown.unmount();

  const android = await render({ os: "android" });
  expect(android.container.innerHTML).toBe("");
  await android.unmount();

  const noClerk = await render({ account: { available: false } });
  expect(noClerk.container.innerHTML).toBe("");
  await noClerk.unmount();

  const loading = await render({ account: { available: true, isLoaded: false } });
  expect(loading.container.innerHTML).toBe("");
  await loading.unmount();

  const unavailable = await render({ available: false });
  expect(unavailable.container.innerHTML).toBe("");
  await unavailable.unmount();
});

it("activates the session Clerk created", async () => {
  const setActive = vi.fn(async (_params: { session: string }) => {});
  const view = await render({ flow: async () => ({ createdSessionId: "sess_1", setActive }) });

  await view.tap();
  expect(setActive).toHaveBeenCalledWith({ session: "sess_1" });
  expect(view.alert()).toBeNull();
  await view.unmount();
});

it("shows nothing when the person cancels", async () => {
  const setActive = vi.fn(async (_params: { session: string }) => {});

  const view = await render({
    flow: async () => ({ createdSessionId: null, setActive, signUp: { status: "abandoned" } }),
  });

  await view.tap();
  expect(setActive).not.toHaveBeenCalled();
  expect(view.alert()).toBeNull();
  await view.unmount();
});

it("shows an error when sign-up is left incomplete", async () => {
  const view = await render({
    flow: async () => ({ createdSessionId: null, signUp: { status: "missing_requirements" } }),
  });

  await view.tap();
  expect(view.alert()).toContain("didn't share enough");
  await view.unmount();
});

it("points a waitlist rejection at Create an account", async () => {
  const view = await render({
    flow: async () => {
      throw new ClerkError("Sign up restricted");
    },
  });

  await view.tap();
  expect(view.alert()).toBe(
    "Color Up is invite-only for now. Join the waitlist with Create an account.",
  );
  await view.unmount();
});

it("shows other errors as they come", async () => {
  const view = await render({
    flow: async () => {
      throw new Error("Network request failed");
    },
  });

  await view.tap();
  expect(view.alert()).toBe("Network request failed");
  await view.unmount();
});

it("starts one flow however many times it is tapped", async () => {
  let finish: (flow: Flow) => void = () => {};
  const view = await render({ flow: () => new Promise<Flow>((resolve) => (finish = resolve)) });

  await view.tap();
  await view.tap();
  await view.tap();
  expect(view.startAppleAuthenticationFlow).toHaveBeenCalledTimes(1);

  await act(async () => finish({ createdSessionId: null }));
  await view.tap();
  expect(view.startAppleAuthenticationFlow).toHaveBeenCalledTimes(2);
  await view.unmount();
});
