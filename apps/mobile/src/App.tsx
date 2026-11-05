import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import {
  DarkTheme,
  DefaultTheme,
  createStaticNavigation,
  type StaticParamList,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { reloadAppAsync } from "expo";
import * as Linking from "expo-linking";
import { Observe } from "expo-observe";
import { StatusBar } from "expo-status-bar";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { useCSSVariable, useUniwind } from "uniwind";

import { Button } from "./components/ui/Button";
import { TabBarHeight } from "./components/ui/Screen";
import { Landing } from "./features/Landing";
import { createPlaceTabs, placeTab, placeTabsConfig, useTabBarHeight } from "./features/PlaceTabs";
import { ScopeButton } from "./features/Scope";
import { YouButton } from "./features/You";
import { clerkPublishableKey } from "./lib/config";
import { markStartup } from "./lib/diagnostics";
import { useAppFonts } from "./lib/fonts";
import { getInitialURL } from "./lib/initialUrl";
import { ScopeProvider, useScopeHasTrip } from "./lib/scope";
import { Prefetch, StacksProvider, useLastTrip, useStacks } from "./lib/stacks";
import "./lib/theme";
import { BoardScreen } from "./screens/Board";
import { ClaimScreen, JoinScreen } from "./screens/Invites";
import { GroupScreen } from "./screens/Group";
import { GroupSettingsScreen } from "./screens/GroupSettings";
import { GroupsScreen, NoGroups } from "./screens/Groups";
import { NewSessionScreen } from "./screens/NewSession";
import { PeopleScreen } from "./screens/People";
import { SessionScreen } from "./screens/Session";
import { SessionsScreen } from "./screens/Sessions";
import { SettleUpScreen } from "./screens/SettleUp";

const stackOptions = {
  headerTransparent: false,
  headerShadowVisible: false,
  headerBackButtonDisplayMode: "minimal",
  headerRight: () => <YouButton />,
  // Your chip and the scope button draw their own shapes, so iOS 26 doesn't wrap them in glass.
  headerRightBackgroundVisible: false,
} as const;

/** A place's own page: the scope where a back button would be, and You beside it. */
const placeOptions = {
  title: "",
  headerLeft: () => <ScopeButton />,
  headerLeftBackgroundVisible: false,
};

const SessionsStack = createNativeStackNavigator({
  screenOptions: stackOptions,
  screens: {
    Sessions: { screen: SessionsScreen, options: placeOptions, linking: "trips/:tripId" },
    Session: { screen: SessionScreen, options: { title: "" }, linking: "sessions/:sessionId" },
    NewSession: {
      screen: NewSessionScreen,
      options: { title: "Start a session" },
      linking: "trips/:tripId/sessions/new",
    },
  },
});

const BoardStack = createNativeStackNavigator({
  screenOptions: stackOptions,
  screens: {
    Board: {
      screen: BoardScreen,
      options: placeOptions,
      // A trip's old Results page and a group's old Stats page are the Board now.
      linking: {
        path: "trips/:tripId/board",
        alias: ["trips/:tripId/results", "groups/:groupId/stats"],
      },
    },
  },
});

const SettleStack = createNativeStackNavigator({
  screenOptions: stackOptions,
  screens: {
    SettleUp: { screen: SettleUpScreen, options: placeOptions, linking: "trips/:tripId/settle" },
  },
});

const GroupStack = createNativeStackNavigator({
  screenOptions: stackOptions,
  screens: {
    Group: { screen: GroupScreen, options: placeOptions, linking: "groups/:groupId" },
    People: {
      screen: PeopleScreen,
      options: { title: "People" },
      linking: "groups/:groupId/people",
    },
    GroupSettings: {
      screen: GroupSettingsScreen,
      options: { title: "Settings" },
      linking: "groups/:groupId/settings",
    },
  },
});

/** Around the tabs: the last trip's requests start early, and screens learn the bar's height. */
function PlacesLayout({ children }: { children: ReactNode }) {
  const stacks = useStacks();
  const { lastTripId } = useLastTrip();
  const bar = useTabBarHeight();
  return (
    <>
      {lastTripId ? (
        <>
          <Prefetch query={stacks.trip(lastTripId)} />
          <Prefetch query={stacks.limits(lastTripId)} />
        </>
      ) : null}
      <NoGroups>
        <TabBarHeight value={bar}>{children}</TabBarHeight>
      </NoGroups>
    </>
  );
}

const Places = createPlaceTabs({
  ...placeTabsConfig,
  initialRouteName: "SessionsTab",
  layout: ({ children }) => <PlacesLayout>{children}</PlacesLayout>,
  screens: {
    // A group with no trips has nothing for the first three places, so only Group is offered.
    SessionsTab: {
      screen: SessionsStack,
      if: useScopeHasTrip,
      options: placeTab("Sessions", "suit.club.fill"),
      linking: { initialRouteName: "Sessions" },
    },
    BoardTab: {
      screen: BoardStack,
      if: useScopeHasTrip,
      options: placeTab("Board", "chart.line.uptrend.xyaxis"),
    },
    SettleTab: {
      screen: SettleStack,
      if: useScopeHasTrip,
      options: placeTab("Settle up", "arrow.left.arrow.right"),
    },
    GroupTab: {
      screen: GroupStack,
      options: placeTab("Group", "person.2"),
      linking: { initialRouteName: "Group" },
    },
  },
});

const RootStack = createNativeStackNavigator({
  initialRouteName: "Places",
  screenOptions: stackOptions,
  screens: {
    Places: { screen: Places, options: { headerShown: false } },
    Groups: { screen: GroupsScreen, options: { title: "Your groups" }, linking: "groups" },
    Join: { screen: JoinScreen, options: { title: "Join a group" }, linking: "join/:code" },
    Claim: {
      screen: ClaimScreen,
      options: { title: "Claim your history" },
      linking: "claim/:code",
    },
  },
});

declare global {
  namespace ReactNavigation {
    interface RootParamList extends StaticParamList<typeof RootStack> {}
  }
}

const Navigation = createStaticNavigation(RootStack);
function Root() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const theme = useNavigationTheme();
  const pendingLink = useRef<string | null>(null);
  useEffect(() => {
    if (isLoaded) markStartup("auth_ready");
    if (isLoaded && !isSignedIn) markStartup("landing_ready");
  }, [isLoaded, isSignedIn]);
  useEffect(() => {
    if (isSignedIn) return;
    const subscription = Linking.addEventListener("url", ({ url }) => {
      if (/\/(join|claim)\//.test(url)) pendingLink.current = url;
    });
    return () => subscription.remove();
  }, [isSignedIn]);
  const linking = {
    enabled: "auto" as const,
    prefixes: [Linking.createURL("/")],
    // A link straight to a session or an invite still has the places to go back to.
    config: { initialRouteName: "Places" as const },
    getInitialURL: async () => {
      const pending = pendingLink.current;
      pendingLink.current = null;
      return (
        pending ??
        getInitialURL(
          () => Linking.getInitialURL(),
          () => Observe.logEvent("startup.initial_url_timeout", { severity: "warn" }),
          (error) => Observe.reportError(error),
        )
      );
    },
  };
  if (!isLoaded) return <Starting />;
  if (!isSignedIn) return <SignedOut />;
  return (
    <StacksProvider key={userId} userId={userId}>
      <ScopeProvider>
        <Navigation
          linking={linking}
          theme={theme}
          fallback={<Opening />}
          onReady={() => markStartup("navigation_ready")}
        />
      </ScopeProvider>
    </StacksProvider>
  );
}

/** Headers and screen backgrounds in the palette, so navigation follows the theme too. */
function useNavigationTheme() {
  const { theme } = useUniwind();
  const [canvas, ink, line, accent, loss] = useCSSVariable([
    "--color-canvas",
    "--color-ink",
    "--color-line",
    "--color-accent-text",
    "--color-loss",
  ]).map(String);
  const base = theme === "light" ? DefaultTheme : DarkTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      background: canvas!,
      card: canvas!,
      text: ink!,
      border: line!,
      primary: accent!,
      notification: loss!,
    },
    fonts: {
      ...base.fonts,
      bold: { fontFamily: "BarlowCondensed-Bold", fontWeight: "normal" as const },
    },
  };
}

const STALLED_MS = 10_000;

function Starting() {
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setStalled(true), STALLED_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!stalled) return <Opening />;
  return (
    <View className="flex-1 justify-center gap-4 bg-canvas px-6">
      <Text accessibilityRole="header" className="type-headline text-ink">
        Can't sign in yet
      </Text>
      <Text className="text-lg text-muted">
        Color Up couldn't reach its sign-in service. Check your connection, then try again.
      </Text>
      <Button label="Try again" variant="primary" size="lg" onPress={() => void reloadAppAsync()} />
    </View>
  );
}

function Opening() {
  return (
    <View className="flex-1 items-center justify-center bg-canvas">
      <Text accessibilityRole="status" className="text-lg text-ink">
        Opening Color Up…
      </Text>
    </View>
  );
}

function SignedOut() {
  return <Landing />;
}

export default function App() {
  useAppFonts();
  useLayoutEffect(() => markStartup("root_committed"), []);
  const { theme } = useUniwind();
  const { width, height } = useWindowDimensions();
  return (
    <SafeAreaProvider
      // A lost first inset event must not hide the loading screen and error boundary.
      initialMetrics={
        initialWindowMetrics ?? {
          frame: { x: 0, y: 0, width, height },
          insets: { top: 0, right: 0, bottom: 0, left: 0 },
        }
      }
    >
      <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
        <Root />
        <StatusBar style={theme === "light" ? "dark" : "light"} />
      </ClerkProvider>
    </SafeAreaProvider>
  );
}
