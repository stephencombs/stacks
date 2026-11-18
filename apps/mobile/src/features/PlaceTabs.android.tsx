import { createNativeBottomTabNavigator } from "@react-navigation/bottom-tabs/unstable";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const createPlaceTabs = createNativeBottomTabNavigator;

export const placeTabsConfig = {
  screenOptions: { headerShown: false, tabBarLabelVisibilityMode: "labeled" as const },
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
