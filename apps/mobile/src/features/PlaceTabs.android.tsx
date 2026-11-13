import {
  createBottomTabNavigator,
  type BottomTabNavigationOptions,
} from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, type IconName } from "../components/ui/Icon";

export const createPlaceTabs = createBottomTabNavigator;
export const placeTabsConfig = {
  screenOptions: {
    headerShown: false,
    tabBarStyle: {
      position: "absolute" as const,
      left: 16,
      right: 16,
      bottom: 12,
      borderTopWidth: 0,
      borderRadius: 32,
      elevation: 0,
    },
  },
};

const icons: Record<string, IconName> = {
  Play: "sessions",
  Stats: "stats",
  Map: "map",
  Crew: "group",
};

export const placeTab = (title: string, _symbol: string): BottomTabNavigationOptions => ({
  title,
  tabBarIcon: ({ focused, size }) => (
    <Icon
      name={icons[title]!}
      color={focused ? "accent-text" : "muted"}
      size={size}
      filled={focused}
    />
  ),
});

export function useTabBarHeight() {
  const insets = useSafeAreaInsets();
  return 61 + insets.bottom;
}
