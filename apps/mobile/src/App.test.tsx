import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vite-plus/test";

it("shows sign-in loading while bundled fonts are still pending", async () => {
  const Container = ({ children }: { children: ReactNode }) => createElement("div", null, children);
  vi.doMock("react-native", () => ({ View: Container, Text: Container }));
  vi.doMock("react-native-safe-area-context", () => ({ SafeAreaProvider: Container }));
  vi.doMock("@clerk/expo", () => ({
    ClerkProvider: Container,
    useAuth: () => ({ isLoaded: false, isSignedIn: false }),
  }));
  vi.doMock("@clerk/expo/token-cache", () => ({ tokenCache: {} }));
  vi.doMock("expo-font", () => ({ useFonts: () => [false, null] }));
  vi.doMock("@expo-google-fonts/barlow-condensed/700Bold", () => ({ BarlowCondensed_700Bold: 1 }));
  vi.doMock("@expo-google-fonts/jetbrains-mono/500Medium", () => ({ JetBrainsMono_500Medium: 2 }));
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
  expect(renderToStaticMarkup(createElement(App))).toContain("Opening Color Up");
});
