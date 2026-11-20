import type { Theme } from "@react-navigation/native";
import { createNativeBottomTabNavigator } from "@react-navigation/bottom-tabs/unstable";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const createPlaceTabs = createNativeBottomTabNavigator;

type TabTheme = Theme & { tabSurface?: string; tabIndicator?: string };

export const placeTabsConfig = {
  screenOptions: ({ theme }: { theme: TabTheme }) => ({
    headerShown: false,
    tabBarLabelVisibilityMode: "labeled" as const,
    tabBarActiveIndicatorWidth: 56,
    tabBarActiveIndicatorHeight: 32,
    tabBarActiveTintColor: theme.colors.text,
    tabBarInactiveTintColor: theme.colors.text,
    tabBarActiveIndicatorColor: theme.tabIndicator,
    tabBarStyle: { backgroundColor: theme.tabSurface },
  }),
};

const drawables: Record<string, string> = {
  Play: "tab_play",
  Stats: "tab_stats",
  Map: "tab_map",
  Crew: "tab_crew",
};

/** Android's own tab bar, with Material Symbols from `assets/tab-icons`: filled when selected. */
export const placeTab = (title: string, _symbol: string) => ({
  title,
  tabBarIcon: ({ focused }: { focused: boolean }) => ({
    type: "image" as const,
    source: { uri: focused ? `${drawables[title]}_selected` : drawables[title]! },
  }),
});

/** Material's tab bar (its navigation bar) is 80dp, drawn over the foot of the screens and the gesture inset. */
export function useTabBarHeight() {
  const insets = useSafeAreaInsets();
  return 80 + insets.bottom;
}
