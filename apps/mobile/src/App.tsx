import {
  DarkTheme,
  DefaultTheme,
  StackActions,
  createStaticNavigation,
  useNavigation,
  type NavigationState,
  type StaticParamList,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { RecordingProvider } from "@stacks/client-runtime/recordingReact";
import { reloadAppAsync } from "expo";
import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { Platform, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { useCSSVariable, useUniwind } from "uniwind";

import { Button } from "./components/ui/Button";
import { HeaderTitle } from "./components/ui/HeaderTitle";
import { TabBarHeight } from "./components/ui/Screen";
import { Landing } from "./features/Landing";
import { LiveAccessoryProvider } from "./lib/liveAccessory";
import { PersonalNav } from "./features/Personal";
import { createPlaceTabs, placeTab, placeTabsConfig, useTabBarHeight } from "./features/PlaceTabs";
import { ScopeButton } from "./features/Scope";
import { YouButton } from "./features/You";
import { AccountProvider, useAccount } from "./lib/account";
import { markStartup, reportStartupError } from "./lib/diagnostics";
import { useAppFonts } from "./lib/fonts";
import { getInitialURL } from "./lib/initialUrl";
import { recordingStore } from "./lib/recording";
import { ScopeProvider, useScopeHasTrip } from "./lib/scope";
import { Prefetch, SignedInProvider, StacksProvider, useLastTrip, useStacks } from "./lib/stacks";
import "./lib/theme";
import { BoardScreen } from "./screens/Board";
import { HomeScreen } from "./screens/Home";
import { ClaimScreen, JoinScreen } from "./screens/Invites";
import { GroupScreen } from "./screens/Group";
import { GroupSettingsScreen } from "./screens/GroupSettings";
import { GroupsScreen, NoGroups } from "./screens/Groups";
import { NewSessionScreen } from "./screens/NewSession";
import { PeopleScreen } from "./screens/People";
import { PlayScreen } from "./screens/Play";
import { PlayerBalancesScreen, PlayerPairScreen } from "./screens/PlayerMoney";
import { SessionScreen } from "./screens/Session";
import { SessionsScreen } from "./screens/Sessions";
import { SettleUpScreen } from "./screens/SettleUp";

const stackOptions = {
  headerTransparent: Platform.OS === "ios",
  headerShadowVisible: false,
  ...(Platform.OS === "ios"
    ? { headerTitle: ({ children }: { children: string }) => <HeaderTitle title={children} /> }
    : {}),
  headerBackButtonDisplayMode: "minimal",
  headerRight: () => <YouButton />,
} as const;

/** A place's own page: the scope where a back button would be, and You beside it. */
const placeOptions = {
  title: "",
  ...(Platform.OS === "ios"
    ? { headerTitle: ({ children }: { children: string }) => <ScopeButton title={children} /> }
    : { headerLeft: () => <ScopeButton /> }),
  headerLeftBackgroundVisible: false,
};

const SessionsStack = createNativeStackNavigator({
  screenOptions: stackOptions,
  screens: {
    Sessions: {
      screen: SessionsScreen,
      options: { ...placeOptions, title: "Sessions" },
      linking: "trips/:tripId",
    },
    Session: {
      screen: SessionScreen,
      options: { title: "Session" },
      linking: "sessions/:sessionId",
    },
  },
});

const BoardStack = createNativeStackNavigator({
  screenOptions: stackOptions,
  screens: {
    Board: {
      screen: BoardScreen,
      options: { ...placeOptions, title: "Board" },
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
    SettleUp: {
      screen: SettleUpScreen,
      options: { ...placeOptions, title: "Settle up" },
      linking: "trips/:tripId/settle",
    },
  },
});

const GroupStack = createNativeStackNavigator({
  screenOptions: stackOptions,
  screens: {
    Group: {
      screen: GroupScreen,
      options: { ...placeOptions, title: "Group" },
      linking: "groups/:groupId",
    },
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
        <LiveAccessoryProvider>
          <TabBarHeight value={bar}>{children}</TabBarHeight>
        </LiveAccessoryProvider>
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

/**
 * Groups, trips and their sessions belong to an account. One gate in front of them all: they wait
 * for sign-in, and share one API client and cache for whoever is signed in.
 */
const AccountStack = createNativeStackNavigator({
  initialRouteName: "Places",
  screenOptions: stackOptions,
  layout: ({ state, children }) => <AccountGate state={state}>{children}</AccountGate>,
  screens: {
    Places: { screen: Places, options: { headerShown: false } },
    NewSession: {
      screen: NewSessionScreen,
      options: { title: "New session", presentation: "modal" },
      linking: "trips/:tripId/sessions/new",
    },
    Groups: { screen: GroupsScreen, options: { title: "Your groups" }, linking: "groups" },
    Join: { screen: JoinScreen, options: { title: "Join a group" }, linking: "join/:code" },
    Claim: {
      screen: ClaimScreen,
      options: { title: "Claim your history" },
      linking: "claim/:code",
    },
  },
});

/** Your own play opens first and lives on this device, so it never waits for sign-in. */
const RootStack = createNativeStackNavigator({
  initialRouteName: "Home",
  screenOptions: {
    title: "",
    headerTransparent: Platform.OS === "ios",
    headerShadowVisible: false,
    ...(Platform.OS === "ios"
      ? { headerTitle: ({ children }: { children: string }) => <HeaderTitle title={children} /> }
      : {}),
    headerBackButtonDisplayMode: "minimal",
    headerRight: () => <PersonalNav />,
  },
  screens: {
    Home: { screen: HomeScreen, linking: "" },
    Play: { screen: PlayScreen, linking: "play/:visitId" },
    // Money between players lives under You, apart from any trip's Settle up.
    PlayerBalances: { screen: PlayerBalancesScreen, linking: "you/settle" },
    PlayerPair: { screen: PlayerPairScreen, linking: "you/settle/:playerId" },
    Account: {
      screen: AccountStack,
      options: { headerShown: false },
      // A link straight to a session or an invite still has the places to go back to.
      linking: { initialRouteName: "Places" },
    },
  },
});

declare global {
  namespace ReactNavigation {
    interface RootParamList extends StaticParamList<typeof RootStack> {}
  }
}

const Navigation = createStaticNavigation(RootStack);

const linking = {
  enabled: "auto" as const,
  prefixes: [Linking.createURL("/")],
  // Back from any link lands on your play.
  config: { initialRouteName: "Home" as const },
  getInitialURL: () =>
    getInitialURL(
      () => Linking.getInitialURL(),
      () => markStartup("initial_url_timeout"),
      reportStartupError,
    ),
};

function Root() {
  const theme = useNavigationTheme();
  // The navigation keeps this same place signed in or out, so sign-in never resets it.
  return (
    <SignedInProvider>
      <Navigation
        linking={linking}
        theme={theme}
        fallback={<Opening />}
        onReady={() => markStartup("navigation_ready")}
      />
    </SignedInProvider>
  );
}

/**
 * Account screens once someone is signed in. Until then, the reason they wait, and a way back to
 * your play. An invite or claim link keeps its place, so it opens once sign-in finishes.
 */
function AccountGate({ state, children }: { state: NavigationState; children: ReactNode }) {
  const account = useAccount();
  const route = state.routes[state.index]?.name;
  if (!account.available) return <NoSignIn />;
  if (!account.isLoaded) return <Starting />;
  if (!account.isSignedIn || !account.userId)
    return <SignedOut invited={route === "Join" || route === "Claim"} />;
  return (
    <StacksProvider key={account.userId}>
      <ScopeProvider>{children}</ScopeProvider>
    </StacksProvider>
  );
}

function BackToYourPlay() {
  const navigation = useNavigation();
  return (
    <Button
      label="Back to your play"
      size="lg"
      onPress={() => navigation.dispatch(StackActions.popTo("Home"))}
    />
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
      bold: { ...base.fonts.bold, fontWeight: "700" as const },
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
        Color Up couldn't reach its sign-in service. Check your connection, then try again. Your
        sessions on this device still work.
      </Text>
      <Button label="Try again" variant="primary" size="lg" onPress={() => void reloadAppAsync()} />
      <BackToYourPlay />
    </View>
  );
}

function NoSignIn() {
  return (
    <View className="flex-1 justify-center gap-4 bg-canvas px-6">
      <Text accessibilityRole="header" className="type-headline text-ink">
        Groups and trips
      </Text>
      <Text className="text-lg text-muted">
        Groups and trips need sign-in, and this copy of Color Up doesn't have it set up.
      </Text>
      <BackToYourPlay />
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

function SignedOut({ invited }: { invited: boolean }) {
  const navigation = useNavigation();
  useEffect(() => markStartup("landing_ready"), []);
  return (
    <Landing invited={invited} onRecord={() => navigation.dispatch(StackActions.popTo("Home"))} />
  );
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
      <RecordingProvider store={recordingStore}>
        <AccountProvider>
          <Root />
          <StatusBar style={theme === "light" ? "dark" : "light"} />
        </AccountProvider>
      </RecordingProvider>
    </SafeAreaProvider>
  );
}
