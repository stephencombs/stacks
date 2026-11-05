// @vitest-environment happy-dom
import { act, createElement, useEffect, useRef, type ReactNode, type Ref } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

const scrollTo = vi.fn();
const selectionAsync = vi.fn();

it("steps through the pitch without a vertical scroll, then opens the account screen", async () => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.doMock("expo-haptics", () => ({
    selectionAsync,
    ImpactFeedbackStyle: { Light: "light" },
  }));
  vi.doMock("react-native-safe-area-context", () => ({
    useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }),
  }));
  vi.doMock("../components/BrandMark", () => ({ BrandMark: () => null }));
  vi.doMock("./TripHero", () => ({
    TripHero: () => createElement("div", { "data-trip": "true" }),
  }));
  vi.doMock("./SignInButton", () => ({
    SignInButton: ({ label }: { label: string }) =>
      createElement("button", { type: "button" }, label),
  }));

  function View({
    children,
    onLayout,
    accessibilityElementsHidden,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    onLayout?: (event: { nativeEvent: { layout: { height: number } } }) => void;
    accessibilityElementsHidden?: boolean;
    accessibilityLabel?: string;
  }) {
    const fired = useRef(false);
    useEffect(() => {
      if (fired.current || !onLayout) return;
      fired.current = true;
      onLayout({ nativeEvent: { layout: { height: 640 } } });
    }, [onLayout]);
    return createElement(
      "div",
      {
        "data-hidden": accessibilityElementsHidden ? "true" : "false",
        "data-label": accessibilityLabel,
      },
      children,
    );
  }

  function ScrollView({
    children,
    horizontal,
    ref,
  }: {
    children?: ReactNode;
    horizontal?: boolean;
    ref?: Ref<{ scrollTo: typeof scrollTo }>;
  }) {
    if (typeof ref === "function") ref({ scrollTo });
    else if (ref) ref.current = { scrollTo };
    return createElement("div", { "data-horizontal": horizontal ? "true" : "false" }, children);
  }

  vi.doMock("react-native", () => ({
    View,
    Text: ({ children }: { children?: ReactNode }) => createElement("span", null, children),
    Pressable: ({
      children,
      onPress,
      accessibilityLabel,
    }: {
      children?: ReactNode;
      onPress?: () => void;
      accessibilityLabel?: string;
    }) =>
      createElement(
        "button",
        { type: "button", onClick: onPress, "aria-label": accessibilityLabel },
        children,
      ),
    ScrollView,
    Animated: {
      Value: class {
        setValue() {}
        stopAnimation() {}
      },
      View,
      timing: () => ({ start() {} }),
    },
    Easing: { bezier: () => () => 0 },
    Platform: { OS: "ios" },
    BackHandler: { addEventListener: () => ({ remove() {} }) },
    AccessibilityInfo: {
      isReduceMotionEnabled: () => Promise.resolve(false),
      addEventListener: () => ({ remove() {} }),
      announceForAccessibility() {},
    },
    useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
  }));

  const { Landing } = await import("./Landing");
  const container = document.createElement("div");
  const root = createRoot(container);
  const button = (label: string) => {
    const found = Array.from(container.querySelectorAll("button")).find(
      (node) => node.textContent === label,
    );
    if (!found) throw new Error(`No ${label} button`);
    return found;
  };
  const step = (label: string) => container.querySelector(`[data-label="${label}"]`);

  try {
    await act(async () => root.render(createElement(Landing)));
    expect(container.querySelector("[data-horizontal='true']")).not.toBeNull();
    expect(container.querySelector("[data-horizontal='false']")).toBeNull();
    expect(step("Keep the casino trip honest.")?.getAttribute("data-hidden")).toBe("false");
    expect(step("Log it at the table.")?.getAttribute("data-hidden")).toBe("true");
    expect(step("Watch the board.")?.getAttribute("data-hidden")).toBe("true");
    expect(step("Settle up once.")?.getAttribute("data-hidden")).toBe("true");
    expect(step("Start a group.")?.getAttribute("data-hidden")).toBe("true");
    expect(button("Create an account").closest("[data-hidden='true']")).not.toBeNull();
    expect(container.textContent).toContain("who owes whom");
    expect(container.textContent).toContain("A rebuy repeats your last amount");
    expect(container.querySelector("[data-trip='true']")).not.toBeNull();

    await act(async () => button("Continue").click());
    expect(step("Log it at the table.")?.getAttribute("data-hidden")).toBe("false");
    expect(step("Keep the casino trip honest.")?.getAttribute("data-hidden")).toBe("true");
    expect(scrollTo).toHaveBeenCalledWith({ x: 390, animated: true });
    expect(selectionAsync).toHaveBeenCalled();

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          "[aria-label='Keep the casino trip honest., step 1 of 4']",
        )
        ?.click();
    });
    expect(step("Keep the casino trip honest.")?.getAttribute("data-hidden")).toBe("false");
    expect(scrollTo).toHaveBeenCalledWith({ x: 0, animated: true });

    await act(async () => button("Continue").click());
    await act(async () => button("Continue").click());
    await act(async () => button("Continue").click());
    expect(step("Settle up once.")?.getAttribute("data-hidden")).toBe("false");
    expect(button("Get started").textContent).toBe("Get started");

    await act(async () => button("Get started").click());
    expect(step("Start a group.")?.getAttribute("data-hidden")).toBe("false");
    expect(button("Create an account").closest("[data-hidden='true']")).toBeNull();
    expect(button("Sign in").textContent).toBe("Sign in");
    expect(container.textContent).toContain("Color Up never moves money.");

    await act(async () => button("Back").click());
    expect(step("Start a group.")?.getAttribute("data-hidden")).toBe("true");
    expect(step("Settle up once.")?.getAttribute("data-hidden")).toBe("false");
    expect(button("Skip").textContent).toBe("Skip");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
