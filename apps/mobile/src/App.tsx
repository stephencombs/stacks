import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { Newsreader_500Medium, useFonts } from "@expo-google-fonts/newsreader";
import { createStaticNavigation, type StaticParamList } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SignInButton } from "./features/SignInButton";
import { clerkPublishableKey } from "./lib/config";
import { StacksProvider } from "./lib/stacks";
import { ClaimScreen, JoinScreen } from "./screens/Invites";
import { GroupScreen } from "./screens/Group";
import { GroupsScreen } from "./screens/Groups";
import { NewSessionScreen } from "./screens/NewSession";
import { PeopleScreen } from "./screens/People";
import { SessionScreen } from "./screens/Session";
import { SettleScreen } from "./screens/Settle";
import { StatsScreen } from "./screens/Stats";
import { TripScreen } from "./screens/Trip";

const RootStack = createNativeStackNavigator({
  screenOptions: {
    headerTransparent: false,
    headerShadowVisible: false,
    headerBackButtonDisplayMode: "minimal",
  },
  screens: {
    Groups: { screen: GroupsScreen, options: { title: "Stacks" }, linking: { path: "" } },
    Group: { screen: GroupScreen, options: { title: "" }, linking: { path: "groups/:groupId" } },
    NewSession: {
      screen: NewSessionScreen,
      options: { title: "Start a session" },
      linking: { path: "groups/:groupId/sessions/new" },
    },
    Session: {
      screen: SessionScreen,
      options: { title: "" },
      linking: { path: "sessions/:sessionId" },
    },
    Settle: {
      screen: SettleScreen,
      options: { title: "Settle up" },
      linking: { path: "groups/:groupId/settle" },
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
      linking: { path: "trips/:tripId" },
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
const linking = { enabled: "auto" as const, prefixes: [Linking.createURL("/")] };

function Root() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  if (!isLoaded) return <View className="flex-1 bg-canvas" />;
  if (!isSignedIn) return <SignedOut />;
  return (
    <StacksProvider key={userId}>
      <Navigation linking={linking} />
    </StacksProvider>
  );
}

function SignedOut() {
  return (
    <View className="flex-1 justify-center gap-6 bg-canvas px-6">
      <Text className="font-serif text-3xl text-ink">Stacks</Text>
      <Text accessibilityRole="header" className="font-serif text-5xl leading-tight text-ink">
        Keep the casino trip honest.
      </Text>
      <Text className="text-lg text-muted">
        Log buy-ins and cash-outs as you play. Stacks works out everyone's results and who owes
        whom, so settling up takes one tap.
      </Text>
      <View className="gap-3">
        <SignInButton mode="sign-up" label="Create an account" variant="primary" />
        <SignInButton mode="sign-in" label="Sign in" variant="secondary" />
      </View>
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({ Newsreader_500Medium });
  return (
    <SafeAreaProvider>
      <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
        {fontsLoaded ? <Root /> : <View className="flex-1 bg-canvas" />}
        <StatusBar style="auto" />
      </ClerkProvider>
    </SafeAreaProvider>
  );
}
