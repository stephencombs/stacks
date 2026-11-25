import {
  DarkTheme,
  DefaultTheme,
  CommonActions,
  createStaticNavigation,
  getStateFromPath,
  useNavigation,
  type StaticParamList,
} from "@react-navigation/native";
import {
  createNativeStackNavigator,
  type NativeStackNavigationOptions,
} from "@react-navigation/native-stack";
import { RecordingProvider } from "@stacks/client-runtime/recordingReact";
import { reloadAppAsync } from "expo";
import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { Platform, View, useWindowDimensions } from "react-native";
import { Text } from "./components/ui/Text";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { useCSSVariable, useUniwind } from "uniwind";

import { Button } from "./components/ui/Button";
import { ConfirmDialogHost } from "./components/ui/ConfirmDialogHost";
import { TabBarHeight } from "./components/ui/tabBar";
import { AccountWipeScreen } from "./features/AccountWipeScreen";
import { Landing } from "./features/Landing";
import { PersonalYouButton, PlayBrand } from "./features/Personal";
import {
  createPlaceTabs,
  PlaceTabsAccessory,
  placeTab,
  placeTabsConfig,
  useTabBarHeight,
} from "./features/PlaceTabs";
import { YouButton } from "./features/You";
import { AccountProvider, useAccount } from "./lib/account";
import { useAccountWipe } from "./lib/accountDeletion";
import { appLinkPrefixes } from "./lib/config";
import { markStartup, reportStartupError } from "./lib/diagnostics";
import { useAppFonts } from "./lib/fonts";
import { getInitialURL } from "./lib/initialUrl";
import { isLiquidGlassSupported } from "./lib/liquidGlass";
import { LiveSessionBridge } from "./lib/liveSessionAdapter";
import { linkAddress } from "./lib/linkAddress";
import { oldAddress } from "./lib/oldAddresses";
import { recordingStore } from "./lib/recording";
import { ScopeProvider } from "./lib/scope";
import { SignedInProvider, StacksProvider } from "./lib/stacks";
import "./lib/theme";
import { HistoryScreen } from "./screens/History";
import { HomeScreen } from "./screens/Home";
import { MapScreen } from "./screens/Map";
import { ClaimScreen, JoinScreen } from "./screens/Invites";
import { CrewGroupsButton, CrewScreen, GroupsScreen } from "./screens/Crew";
import { GroupScreen } from "./screens/Group";
import { GroupSettingsScreen } from "./screens/GroupSettings";
import { PlayScreen } from "./screens/Play";
import { RedeemInviteScreen } from "./screens/RedeemInvite";
import { TableScreen } from "./screens/Table";
import { SessionScreen } from "./screens/Session";
import { SessionsScreen } from "./screens/Sessions";
import { SharedTableScreen } from "./screens/SharedTable";
import { StatsScreen } from "./screens/Stats";

const headerOptions: NativeStackNavigationOptions = {
  headerShown: true,
  headerTransparent: isLiquidGlassSupported,
  headerStyle: isLiquidGlassSupported ? { backgroundColor: "transparent" } : undefined,
  headerShadowVisible: false,
  headerLargeTitle: false,
  headerBackButtonDisplayMode: "minimal",
  headerBackTitle: "",
  scrollEdgeEffects: isLiquidGlassSupported
    ? { top: "automatic", bottom: "hidden", left: "hidden", right: "hidden" }
    : undefined,
};

const personalOptions = {
  ...headerOptions,
  title: "",
  ...(Platform.OS === "android" ? { headerRight: () => <PersonalYouButton /> } : null),
};

const PlayStack = createNativeStackNavigator({
  screenOptions: personalOptions,
  screens: {
    Home: {
      screen: HomeScreen,
      linking: "",
      options: { headerLeft: () => <PlayBrand />, headerLeftBackgroundVisible: false },
    },
    History: {
      screen: HistoryScreen,
      linking: "history/:period?",
      options:
        Platform.OS === "android"
          ? { title: "", headerRight: undefined }
          : { title: "All sessions" },
    },
  },
});

const StatsStack = createNativeStackNavigator({
  screenOptions: personalOptions,
  screens: { Stats: { screen: StatsScreen, linking: "stats" } },
});

const MapStack = createNativeStackNavigator({
  screenOptions: personalOptions,
  screens: { Map: { screen: MapScreen, linking: "map" } },
});

const CrewStack = createNativeStackNavigator({
  initialRouteName: "Crew",
  screenOptions: headerOptions,
  layout: ({ children }) => <AccountGate>{children}</AccountGate>,
  screens: {
    Crew: {
      screen: CrewScreen,
      options: {
        title: "",
        ...(Platform.OS === "android"
          ? {
              headerRight: () => (
                <View className="flex-row items-center gap-2">
                  <CrewGroupsButton />
                  <YouButton />
                </View>
              ),
            }
          : null),
      },
      linking: "crew",
    },
    Group: { screen: GroupScreen, options: { title: "" }, linking: "groups/:groupId" },
    GroupSettings: {
      screen: GroupSettingsScreen,
      options: { title: Platform.OS === "android" ? "" : "Settings" },
      linking: "groups/:groupId/settings",
    },
    Sessions: { screen: SessionsScreen, options: { title: "" }, linking: "trips/:tripId" },
    Groups: {
      screen: Platform.OS === "android" ? GroupsScreen : CrewScreen,
      options: { title: "", headerShown: Platform.OS !== "android" },
      linking: "groups",
    },
    People: { screen: GroupScreen, options: { title: "" }, linking: "groups/:groupId/people" },
  },
});

function TabsLayout({ children }: { children: ReactNode }) {
  const bar = useTabBarHeight();

  return (
    <TabBarHeight value={bar}>
      <PlaceTabsAccessory>{children}</PlaceTabsAccessory>
    </TabBarHeight>
  );
}

const Tabs = createPlaceTabs({
  ...placeTabsConfig,
  initialRouteName: "PlayTab",
  layout: ({ children }) => <TabsLayout>{children}</TabsLayout>,
  screens: {
    PlayTab: {
      screen: PlayStack,
      options: placeTab("Play"),
      linking: { initialRouteName: "Home" },
    },
    StatsTab: { screen: StatsStack, options: placeTab("Stats") },
    MapTab: { screen: MapStack, options: placeTab("Map") },
    CrewTab: {
      screen: CrewStack,
      options: placeTab("Crew"),
      linking: { initialRouteName: "Crew" },
    },
  },
});

const InvitesStack = createNativeStackNavigator({
  screenOptions: headerOptions,
  layout: ({ children }) => <AccountGate invited>{children}</AccountGate>,
  screens: {
    Join: {
      screen: JoinScreen,
      options: { title: Platform.OS === "android" ? "" : "Invite" },
      linking: "join/:code",
    },
    Claim: {
      screen: ClaimScreen,
      options: { title: Platform.OS === "android" ? "" : "Invite" },
      linking: "claim/:code",
    },
  },
});

const RootStack = createNativeStackNavigator({
  initialRouteName: "Tabs",
  screenOptions: ({ theme }) =>
    Platform.OS === "android"
      ? { ...headerOptions, title: "" }
      : { ...personalOptions, statusBarStyle: theme.dark ? "light" : "dark" },
  screens: {
    Tabs: { screen: Tabs, options: { headerShown: false } },
    Play: { screen: PlayScreen, linking: "play/:visitId" },
    Session: {
      screen: SessionScreen,
      linking: "sessions/:sessionId",
      layout: ({ children }) => <AccountGate>{children}</AccountGate>,
    },
    Table: {
      screen: TableScreen,
      linking: "tables/:tableId",
      options: { title: Platform.OS === "android" ? "" : "Table" },
    },
    SharedTable: {
      screen: SharedTableScreen,
      linking: "t/:token",
      options: { title: Platform.OS === "android" ? "" : "Shared table" },
    },
    RedeemInvite: {
      screen: RedeemInviteScreen,
      linking: "invite/:token",
      options: { title: Platform.OS === "android" ? "" : "Invite" },
    },
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
  prefixes: appLinkPrefixes(),
  config: { initialRouteName: "Tabs" as const },
  getStateFromPath: (path: string, options?: Parameters<typeof getStateFromPath>[1]) =>
    getStateFromPath(oldAddress(linkAddress(path)), options),
  getInitialURL: () =>
    getInitialURL(
      () => Linking.getInitialURL(),
      () => markStartup("initial_url_timeout"),
      reportStartupError,
    ),
};

function Root() {
  const theme = useNavigationTheme();

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

function useNavigationTheme() {
  const { theme } = useUniwind();

  const [canvas, ink, line, loss, tabSurface, tabIndicator] = useCSSVariable([
    "--color-canvas",
    "--color-ink",
    "--color-line",
    "--color-loss",
    "--color-surface",
    "--color-fill-strong",
  ]).map(String);

  const base = theme === "light" ? DefaultTheme : DarkTheme;

  return {
    ...base,
    tabSurface,
    tabIndicator,
    colors: {
      ...base.colors,
      background: canvas!,
      card: canvas!,
      text: ink!,
      border: line!,
      primary: ink!,
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
      <Text accessibilityLiveRegion="polite" className="text-lg text-ink">
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

function WipeGate({ children }: { children: ReactNode }) {
  const wipe = useAccountWipe();

  return wipe ? <AccountWipeScreen wipe={wipe} /> : children;
}

export default function App() {
  const loadingFonts = useAppFonts();
  useLayoutEffect(() => markStartup("root_committed"), []);
  const { theme } = useUniwind();
  const { width, height } = useWindowDimensions();

  if (loadingFonts) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider
        initialMetrics={
          initialWindowMetrics ?? {
            frame: { x: 0, y: 0, width, height },
            insets: { top: 0, right: 0, bottom: 0, left: 0 },
          }
        }
      >
        <AccountProvider>
          <StatusBar style={theme === "light" ? "dark" : "light"} />
          <WipeGate>
            <RecordingProvider store={recordingStore}>
              <LiveSessionBridge />
              <Root />
              <ConfirmDialogHost />
            </RecordingProvider>
          </WipeGate>
        </AccountProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
