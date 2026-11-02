import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { BarlowCondensed_700Bold } from "@expo-google-fonts/barlow-condensed/700Bold";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono/500Medium";
import {
  DarkTheme,
  DefaultTheme,
  createStaticNavigation,
  type StaticParamList,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { reloadAppAsync } from "expo";
import * as Linking from "expo-linking";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useCSSVariable, useUniwind } from "uniwind";

import { Button } from "./components/ui/Button";
import { SignInButton } from "./features/SignInButton";
import { clerkPublishableKey } from "./lib/config";
import { StacksProvider } from "./lib/stacks";
import "./lib/theme";
import { ClaimScreen, JoinScreen } from "./screens/Invites";
import { GroupScreen } from "./screens/Group";
import { GroupsScreen } from "./screens/Groups";
import { HomeScreen } from "./screens/Home";
import { NewSessionScreen } from "./screens/NewSession";
import { PeopleScreen } from "./screens/People";
import { SessionScreen } from "./screens/Session";
import { StatsScreen } from "./screens/Stats";
import { TripScreen } from "./screens/Trip";

// The trip's tabs are a navigator inside Home and Trip; these give them their own addresses.
const tripTabPaths = { Sessions: "", Results: "results", SettleUp: "settle" };

const RootStack = createNativeStackNavigator({
  screenOptions: {
    headerTransparent: false,
    headerShadowVisible: false,
    headerBackButtonDisplayMode: "minimal",
  },
  screens: {
    Home: {
      screen: HomeScreen,
      options: { title: "" },
      linking: { path: "", screens: tripTabPaths },
    },
    Groups: { screen: GroupsScreen, options: { title: "Stacks" }, linking: { path: "groups" } },
    Group: { screen: GroupScreen, options: { title: "" }, linking: { path: "groups/:groupId" } },
    NewSession: {
      screen: NewSessionScreen,
      options: { title: "Start a session" },
      linking: { path: "trips/:tripId/sessions/new" },
    },
    Session: {
      screen: SessionScreen,
      options: { title: "" },
      linking: { path: "sessions/:sessionId" },
    },
    Stats: {
      screen: StatsScreen,
      options: { title: "Stats" },
      linking: { path: "groups/:groupId/stats" },
    },
    People: {
      screen: PeopleScreen,
      options: { title: "People" },
      linking: { path: "groups/:groupId/people" },
    },
    Trip: {
      screen: TripScreen,
      options: { title: "" },
      linking: { path: "trips/:tripId", screens: tripTabPaths },
    },
    Join: {
      screen: JoinScreen,
      options: { title: "Join a group" },
      linking: { path: "join/:code" },
    },
    Claim: {
      screen: ClaimScreen,
      options: { title: "Claim your history" },
      linking: { path: "claim/:code" },
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
    if (isSignedIn) return;
    const subscription = Linking.addEventListener("url", ({ url }) => {
      if (/\/(join|claim)\//.test(url)) pendingLink.current = url;
    });
    return () => subscription.remove();
  }, [isSignedIn]);
  const linking = {
    enabled: "auto" as const,
    prefixes: [Linking.createURL("/")],
    getInitialURL: async () => {
      const url = pendingLink.current ?? (await Linking.getInitialURL());
      pendingLink.current = null;
      return url;
    },
  };
  if (!isLoaded) return <Starting />;
  if (!isSignedIn) return <SignedOut />;
  return (
    <StacksProvider key={userId} userId={userId}>
      <Navigation linking={linking} theme={theme} />
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
      bold: { fontFamily: "BarlowCondensed_700Bold", fontWeight: "normal" as const },
    },
  };
}

const STALLED_MS = 10_000;

/** Blank while sign-in starts; if it never does, say so instead of staying blank forever. */
function Starting() {
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setStalled(true), STALLED_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!stalled) return <View className="flex-1 bg-canvas" />;
  return (
    <View className="flex-1 justify-center gap-4 bg-canvas px-6">
      <Text accessibilityRole="header" className="type-headline text-ink">
        Can't sign in yet
      </Text>
      <Text className="text-lg text-muted">
        Stacks couldn't reach its sign-in service. Check your connection, then try again.
      </Text>
      <Button label="Try again" variant="primary" size="lg" onPress={() => void reloadAppAsync()} />
    </View>
  );
}

function SignedOut() {
  return (
    <View className="flex-1 justify-center gap-6 bg-canvas px-6">
      <View className="flex-row items-center gap-2">
        <View className="size-3 rotate-45 rounded-[3px] bg-accent" />
        <Text className="font-display text-2xl tracking-wide text-ink uppercase">Stacks</Text>
      </View>
      <View className="gap-3">
        <Text
          accessibilityRole="header"
          className="font-display text-6xl leading-[56px] text-ink uppercase"
        >
          Keep the casino trip honest.
        </Text>
      </View>
      <Text className="text-lg text-muted">
        Log buy-ins and cash-outs as you play. Stacks works out everyone's results and who owes
        whom. You pay each other however you like.
      </Text>
      <View className="gap-3">
        <SignInButton mode="sign-up" label="Create an account" variant="primary" />
        <SignInButton mode="sign-in" label="Sign in" variant="secondary" />
      </View>
    </View>
  );
}

export default function App() {
  // Fonts that fail to load fall back to the system's rather than holding the app on a blank screen.
  const [fontsLoaded, fontsFailed] = useFonts({ BarlowCondensed_700Bold, JetBrainsMono_500Medium });
  const { theme } = useUniwind();
  return (
    <SafeAreaProvider>
      <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
        {fontsLoaded || fontsFailed ? <Root /> : <View className="flex-1 bg-canvas" />}
        <StatusBar style={theme === "light" ? "dark" : "light"} />
      </ClerkProvider>
    </SafeAreaProvider>
  );
}
