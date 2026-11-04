import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vite-plus/test";

it.each([
  { label: "unavailable", metrics: null, insets: "0,0,0,0" },
  {
    label: "available",
    metrics: {
      frame: { x: 0, y: 0, width: 440, height: 956 },
      insets: { top: 62, right: 0, bottom: 34, left: 0 },
    },
    insets: "62,0,34,0",
  },
])("starts without native inset events ($label)", async ({ metrics, insets }) => {
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
    useAuth: () => ({ isLoaded: false, isSignedIn: false }),
  }));
  vi.doMock("@clerk/expo/token-cache", () => ({ tokenCache: {} }));
  vi.doMock("expo-font", () => ({ useFonts: () => [false, null] }));
  vi.doMock("@expo-google-fonts/barlow-condensed/700Bold", () => ({
    BarlowCondensed_700Bold: 1,
  }));
  vi.doMock("@expo-google-fonts/jetbrains-mono/500Medium", () => ({
    JetBrainsMono_500Medium: 2,
  }));
  vi.doMock("expo", () => ({ reloadAppAsync: vi.fn() }));
  vi.doMock("expo-linking", () => ({ createURL: () => "stacks://" }));
  vi.doMock("expo-status-bar", () => ({ StatusBar: () => null }));
  vi.doMock("uniwind", () => ({
    useUniwind: () => ({ theme: "dark" }),
    useCSSVariable: () => ["black", "white", "gray", "gold", "red"],
  }));
  vi.doMock("@react-navigation/native", () => ({
    DarkTheme: { colors: {}, fonts: {} },
    DefaultTheme: { colors: {}, fonts: {} },
    createStaticNavigation: () => Container,
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
});
