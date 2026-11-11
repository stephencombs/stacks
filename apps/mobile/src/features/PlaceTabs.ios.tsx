import {
  createNativeBottomTabNavigator,
  type NativeBottomTabIcon,
} from "@react-navigation/bottom-tabs/unstable";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const createPlaceTabs = createNativeBottomTabNavigator;

export const placeTabsConfig = {
  screenOptions: { headerShown: false },
};

export const placeTab = (
  title: string,
  symbol: Extract<NativeBottomTabIcon, { type: "sfSymbol" }>["name"],
) => ({ title, tabBarIcon: { type: "sfSymbol" as const, name: symbol } });

export function useTabBarHeight() {
  const insets = useSafeAreaInsets();
  return 49 + insets.bottom;
}
