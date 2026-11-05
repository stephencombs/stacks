import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vite-plus/test";

it.each([
  { label: "unavailable", metrics: null, insets: "0,0,0,0", signedIn: false },
  { label: "unavailable after sign-in", metrics: null, insets: "0,0,0,0", signedIn: true },
  {
    label: "available",
    metrics: {
      frame: { x: 0, y: 0, width: 440, height: 956 },
      insets: { top: 62, right: 0, bottom: 34, left: 0 },
    },
    insets: "62,0,34,0",
    signedIn: false,
  },
])("starts without native inset events ($label)", async ({ metrics, insets, signedIn }) => {
  vi.resetModules();
  const Container = ({ children }: { children: ReactNode }) => createElement("div", null, children);
  const window = { width: 440, height: 956, scale: 3, fontScale: 1 };
  vi.doMock("react-native", () => ({
    View: Container,
    Text: Container,
    Dimensions: { get: () => window },
    useWindowDimensions: () => window,
    StyleSheet: { create: (styles: object) => styles },
  }));
  vi.doMock("react-native-safe-area-context/lib/module/NativeSafeAreaProvider", () => ({
    NativeSafeAreaProvider: Container,
  }));
  const { SafeAreaProvider, useSafeAreaInsets } = await vi.importActual<
    typeof import("react-native-safe-area-context")
  >("react-native-safe-area-context/lib/module/SafeAreaContext");
  vi.doMock("react-native-safe-area-context", () => ({
    SafeAreaProvider,
    initialWindowMetrics: metrics,
  }));
  function AuthProvider({ children }: { children: ReactNode }) {
    const { top, right, bottom, left } = useSafeAreaInsets();
    return createElement("div", { "data-insets": [top, right, bottom, left].join(",") }, children);
  }
  vi.doMock("@clerk/expo", () => ({
    ClerkProvider: AuthProvider,
    useAuth: () => ({ isLoaded: signedIn, isSignedIn: signedIn, userId: "test-user" }),
  }));
  vi.doMock("@clerk/expo/token-cache", () => ({ tokenCache: {} }));
  vi.doMock("expo", () => ({ reloadAppAsync: vi.fn() }));
  const markStartup = vi.fn();
  vi.doMock("./lib/diagnostics", () => ({ markStartup, reportStartupError: vi.fn() }));
  vi.doMock("expo-linking", () => ({
    createURL: () => "stacks://",
    getInitialURL: () => new Promise<string | null>(() => {}),
  }));
  vi.doMock("expo-status-bar", () => ({ StatusBar: () => null }));
  vi.doMock("uniwind", () => ({
    useUniwind: () => ({ theme: "dark" }),
    useCSSVariable: () => ["black", "white", "gray", "gold", "red"],
  }));
  const navigation = vi.fn(
    ({
      fallback,
    }: {
      fallback: ReactNode;
      linking: { getInitialURL: () => Promise<string | null> };
      onReady: () => void;
    }) => fallback,
  );
  vi.doMock("@react-navigation/native", () => ({
    DarkTheme: { colors: {}, fonts: {} },
    DefaultTheme: { colors: {}, fonts: {} },
    createStaticNavigation: () => navigation,
  }));
  vi.doMock("@react-navigation/native-stack", () => ({ createNativeStackNavigator: vi.fn() }));
  vi.doMock("./features/PlaceTabs", () => ({
    createPlaceTabs: vi.fn(),
    placeTab: vi.fn(),
    placeTabsConfig: {},
    useTabBarHeight: vi.fn(),
  }));
  vi.doMock("./lib/config", () => ({ clerkPublishableKey: "test" }));
  vi.doMock("./lib/theme", () => ({}));
  for (const module of [
    "./components/ui/Button",
    "./components/ui/Screen",
    "./features/Landing",
    "./features/Scope",
    "./features/You",
    "./lib/scope",
    "./lib/stacks",
    "./screens/Board",
    "./screens/Invites",
    "./screens/Group",
    "./screens/GroupSettings",
    "./screens/Groups",
    "./screens/NewSession",
    "./screens/People",
    "./screens/Session",
    "./screens/Sessions",
    "./screens/SettleUp",
  ]) {
    vi.doMock(module, () =>
      Object.fromEntries(
        [
          "Button",
          "TabBarHeight",
          "Landing",
          "ScopeButton",
          "YouButton",
          "ScopeProvider",
          "useScopeHasTrip",
          "Prefetch",
          "StacksProvider",
          "useLastTrip",
          "useStacks",
          "BoardScreen",
          "ClaimScreen",
          "JoinScreen",
          "GroupScreen",
          "GroupSettingsScreen",
          "GroupsScreen",
          "NoGroups",
          "NewSessionScreen",
          "PeopleScreen",
          "SessionScreen",
          "SessionsScreen",
          "SettleUpScreen",
        ].map((name) => [name, Container]),
      ),
    );
  }
  const { default: App } = await import("./App");
  const markup = renderToStaticMarkup(createElement(App));
  expect(markup).toContain("Opening Color Up");
  expect(markup).toContain(`data-insets="${insets}"`);
  if (signedIn) {
    const { linking, onReady } = navigation.mock.calls[0]![0];
    vi.useFakeTimers();
    try {
      const url = linking.getInitialURL();
      await vi.advanceTimersByTimeAsync(1_500);
      await expect(url).resolves.toBeNull();
      expect(markStartup).toHaveBeenCalledWith("initial_url_timeout");
      onReady();
      expect(markStartup).toHaveBeenCalledWith("navigation_ready");
    } finally {
      vi.useRealTimers();
    }
  }
});
