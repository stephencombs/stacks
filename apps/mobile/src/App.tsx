import { RegistryProvider } from "@effect/atom-react";
import { createStaticNavigation } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { HomeScreen } from "./HomeScreen";

const RootStack = createNativeStackNavigator({
  screens: {
    Home: { screen: HomeScreen, options: { headerShown: false } },
  },
});

const Navigation = createStaticNavigation(RootStack);

export default function App() {
  return (
    <SafeAreaProvider>
      <RegistryProvider>
        <Navigation />
        <StatusBar style="auto" />
      </RegistryProvider>
    </SafeAreaProvider>
  );
}
