import {
  createNativeBottomTabNavigator,
  type NativeBottomTabIcon,
} from "@react-navigation/bottom-tabs/unstable";
import type { ReactNode } from "react";
import { PlatformColor } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { isLiquidGlassSupported } from "../lib/liquidGlass";
import { LiveAccessoryHost, LiveAccessoryOptions } from "./LiveAccessory";

export const createPlaceTabs = createNativeBottomTabNavigator;

export const placeTabsConfig = {
  screenOptions: {
    headerShown: false,
    tabBarActiveTintColor: PlatformColor("systemBlue"),
    ...(isLiquidGlassSupported ? { tabBarMinimizeBehavior: "onScrollDown" as const } : null),
  },
  ...(isLiquidGlassSupported ? { screenLayout: LiveAccessoryOptions } : null),
};

/** On iOS 26 the tab bar carries the LiveBar as its own accessory; elsewhere the LiveBar is pinned. */
export function PlaceTabsAccessory({ children }: { children: ReactNode }) {
  return isLiquidGlassSupported ? <LiveAccessoryHost>{children}</LiveAccessoryHost> : children;
}

const icons = {
  Play: [
    require("../../assets/tab-icons/ios/play.png"),
    require("../../assets/tab-icons/ios/play-selected.png"),
  ],
  Stats: [
    require("../../assets/tab-icons/ios/stats.png"),
    require("../../assets/tab-icons/ios/stats-selected.png"),
  ],
  Map: [
    require("../../assets/tab-icons/ios/map.png"),
    require("../../assets/tab-icons/ios/map-selected.png"),
  ],
  Crew: [
    require("../../assets/tab-icons/ios/crew.png"),
    require("../../assets/tab-icons/ios/crew-selected.png"),
  ],
} as const;

export const placeTab = (title: keyof typeof icons) => ({
  title,
  tabBarIcon: ({ focused }: { focused: boolean }) =>
    ({
      type: "image",
      source: icons[title][focused ? 1 : 0],
      tinted: !focused,
    }) satisfies NativeBottomTabIcon,
});

export function useTabBarHeight() {
  const insets = useSafeAreaInsets();

  return 49 + insets.bottom;
}
