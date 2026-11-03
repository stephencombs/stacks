import { createNativeBottomTabNavigator } from "@react-navigation/bottom-tabs/unstable";
import type { SFSymbol } from "expo-symbols";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** The four places on the system's own tab bar: UITabBarController on iOS. */
export const createPlaceTabs = createNativeBottomTabNavigator;

/** What the web build adds to the tabs: its own bar. Native tabs need nothing more. */
export const placeTabsConfig = {};

export const placeTab = (title: string, symbol: SFSymbol) => ({
  title,
  ...(Platform.OS === "ios" ? { tabBarIcon: { type: "sfSymbol" as const, name: symbol } } : {}),
});

/** How much room the tab bar takes at the bottom; native tabs don't report it to JS. */
export function useTabBarHeight() {
  const insets = useSafeAreaInsets();
  return (Platform.OS === "ios" ? 49 : 80) + insets.bottom;
}
