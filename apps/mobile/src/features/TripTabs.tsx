import { createNativeBottomTabNavigator } from "@react-navigation/bottom-tabs/unstable";
import type { ReactNode } from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCSSVariable } from "uniwind";

import { tripTabs, type TripTab } from "./tripTabConfig";

const Tabs = createNativeBottomTabNavigator();

/** The trip's tabs on the system's own tab bar: UITabBarController on iOS. */
export function TripTabs({
  initial,
  render,
}: {
  initial: TripTab;
  /** One tab's screen, given how much room the tab bar takes at the bottom. */
  render: (tab: TripTab, barHeight: number) => ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [active, inactive] = useCSSVariable(["--color-ink", "--color-muted"]).map(String);
  // The bar's own height above the home indicator; native tabs don't report it to JS.
  const barHeight = (Platform.OS === "ios" ? 49 : 80) + insets.bottom;
  return (
    <Tabs.Navigator
      initialRouteName={tripTabs[initial].route}
      screenOptions={{ tabBarActiveTintColor: active, tabBarInactiveTintColor: inactive }}
    >
      {(Object.keys(tripTabs) as ReadonlyArray<TripTab>).map((tab) => (
        <Tabs.Screen
          key={tab}
          name={tripTabs[tab].route}
          options={{
            title: tripTabs[tab].label,
            ...(Platform.OS === "ios"
              ? { tabBarIcon: { type: "sfSymbol" as const, name: tripTabs[tab].symbol } }
              : {}),
          }}
        >
          {() => render(tab, barHeight)}
        </Tabs.Screen>
      ))}
    </Tabs.Navigator>
  );
}
