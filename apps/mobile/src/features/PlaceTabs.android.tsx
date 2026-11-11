import {
  createBottomTabNavigator,
  type BottomTabNavigationOptions,
} from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, type IconName } from "../components/ui/Icon";

export const createPlaceTabs = createBottomTabNavigator;
export const placeTabsConfig = { screenOptions: { headerShown: false } };

const icons: Record<string, IconName> = {
  Sessions: "sessions",
  Board: "board",
  "Settle up": "settle",
  Group: "group",
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
  return 49 + insets.bottom;
}
