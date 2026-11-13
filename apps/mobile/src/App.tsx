import {
  DarkTheme,
  DefaultTheme,
  CommonActions,
  createStaticNavigation,
  useNavigation,
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
import { PersonalYouButton } from "./features/Personal";
import { createPlaceTabs, placeTab, placeTabsConfig, useTabBarHeight } from "./features/PlaceTabs";
import { YouButton } from "./features/You";
import { AccountProvider, useAccount } from "./lib/account";
import { markStartup, reportStartupError } from "./lib/diagnostics";
import { useAppFonts } from "./lib/fonts";
import { getInitialURL } from "./lib/initialUrl";
import { recordingStore } from "./lib/recording";
import { ScopeProvider } from "./lib/scope";
import { SignedInProvider, StacksProvider } from "./lib/stacks";
import "./lib/theme";
import { BoardScreen } from "./screens/Board";
import { HomeScreen } from "./screens/Home";
import { MapScreen } from "./screens/Map";
import { ClaimScreen, JoinScreen } from "./screens/Invites";
import { GroupScreen } from "./screens/Group";
import { GroupSettingsScreen } from "./screens/GroupSettings";
import { GroupsScreen } from "./screens/Groups";
import { NewSessionScreen } from "./screens/NewSession";
import { PeopleScreen } from "./screens/People";
import { PlayScreen } from "./screens/Play";
import { SessionScreen } from "./screens/Session";
import { SessionsScreen } from "./screens/Sessions";
import { StatsScreen } from "./screens/Stats";

const headerOptions = {
  headerTransparent: Platform.OS === "ios",
  headerShadowVisible: false,
  ...(Platform.OS === "ios"
    ? { headerTitle: ({ children }: { children: string }) => <HeaderTitle title={children} /> }
    : {}),
  headerBackButtonDisplayMode: "minimal",
} as const;

/** Your own play: You for anyone, signed in or not. */
const personalOptions = { ...headerOptions, title: "", headerRight: () => <PersonalYouButton /> };

/** Groups and trips: You with your chip in the group in scope. */
const crewOptions = { ...headerOptions, headerRight: () => <YouButton /> };

const PlayStack = createNativeStackNavigator({
  screenOptions: personalOptions,
  screens: { Home: { screen: HomeScreen, linking: "" } },
});

const StatsStack = createNativeStackNavigator({
  screenOptions: personalOptions,
  screens: { Stats: { screen: StatsScreen, linking: "stats" } },
});

const MapStack = createNativeStackNavigator({
  screenOptions: personalOptions,
  screens: { Map: { screen: MapScreen, linking: "map" } },
});

/**
 * Groups, trips and their sessions belong to an account. One gate in front of them all: they wait
 * for sign-in, and share one API client and cache for whoever is signed in. Each is pushed onto
 * your groups, so back always lands in Crew.
 */
const CrewStack = createNativeStackNavigator({
  initialRouteName: "Crew",
  screenOptions: crewOptions,
  layout: ({ children }) => <AccountGate>{children}</AccountGate>,
  screens: {
    Crew: { screen: GroupsScreen, options: { title: "" }, linking: "crew" },
    Group: { screen: GroupScreen, options: { title: "" }, linking: "groups/:groupId" },
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
    Sessions: { screen: SessionsScreen, options: { title: "" }, linking: "trips/:tripId" },
    Board: { screen: BoardScreen, options: { title: "" }, linking: "trips/:tripId/board" },
    // Old addresses. A linking alias here would leave every screen in this stack without typed
    // params, so each is a screen of its own: your groups, a trip's Results and a group's Stats.
    Groups: { screen: GroupsScreen, options: { title: "" }, linking: "groups" },
    Results: { screen: BoardScreen, options: { title: "" }, linking: "trips/:tripId/results" },
    GroupStats: { screen: BoardScreen, options: { title: "" }, linking: "groups/:groupId/stats" },
    Session: { screen: SessionScreen, options: { title: "" }, linking: "sessions/:sessionId" },
    NewSession: {
      screen: NewSessionScreen,
      options: { title: "Start a session" },
      linking: "trips/:tripId/sessions/new",
    },
  },
});

/** Around the tabs: screens learn the bar's height, to keep clear of it. */
function TabsLayout({ children }: { children: ReactNode }) {
  const bar = useTabBarHeight();
  return <TabBarHeight value={bar}>{children}</TabBarHeight>;
}

const Tabs = createPlaceTabs({
  ...placeTabsConfig,
  initialRouteName: "PlayTab",
  layout: ({ children }) => <TabsLayout>{children}</TabsLayout>,
  screens: {
    PlayTab: { screen: PlayStack, options: placeTab("Play", "suit.club.fill") },
    StatsTab: { screen: StatsStack, options: placeTab("Stats", "chart.bar.fill") },
    MapTab: { screen: MapStack, options: placeTab("Map", "map.fill") },
    CrewTab: {
      screen: CrewStack,
      options: placeTab("Crew", "person.2.fill"),
      linking: { initialRouteName: "Crew" },
    },
  },
});

/** Opening an invite or claim link happens before you're in the group, so it has no tabs. */
const InvitesStack = createNativeStackNavigator({
  screenOptions: crewOptions,
  layout: ({ children }) => <AccountGate invited>{children}</AccountGate>,
  screens: {
    Join: { screen: JoinScreen, options: { title: "Join a group" }, linking: "join/:code" },
    Claim: {
      screen: ClaimScreen,
      options: { title: "Claim your history" },
      linking: "claim/:code",
    },
  },
});

/** The tabs, and above them the pages that fill the screen: a live session and invitations. */
const RootStack = createNativeStackNavigator({
  initialRouteName: "Tabs",
  screenOptions: personalOptions,
  screens: {
    Tabs: { screen: Tabs, options: { headerShown: false } },
    Play: { screen: PlayScreen, linking: "play/:visitId" },
    Invites: { screen: InvitesStack, options: { headerShown: false } },
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
  // Back from any link lands on the tabs.
  config: { initialRouteName: "Tabs" as const },
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
function AccountGate({ invited = false, children }: { invited?: boolean; children: ReactNode }) {
  const account = useAccount();
  if (!account.available) return <NoSignIn />;
  if (!account.isLoaded) return <Starting />;
  if (!account.isSignedIn || !account.userId) return <SignedOut invited={invited} />;
  return (
    <StacksProvider key={account.userId}>
      <ScopeProvider>{children}</ScopeProvider>
    </StacksProvider>
  );
}

/** Your own play, from anywhere: the Play tab at its start. */
const toPlay = () =>
  CommonActions.navigate({
    name: "Tabs",
    params: { screen: "PlayTab", params: { screen: "Home" } },
  });

function BackToYourPlay() {
  const navigation = useNavigation();
  return (
    <Button label="Back to your play" size="lg" onPress={() => navigation.dispatch(toPlay())} />
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
  return <Landing invited={invited} onRecord={() => navigation.dispatch(toPlay())} />;
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
