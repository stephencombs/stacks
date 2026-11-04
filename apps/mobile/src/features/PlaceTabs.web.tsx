import { createBottomTabNavigator, type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cn } from "../components/ui/cn";

export const createPlaceTabs = createBottomTabNavigator;

/** The web build has no system tab bar, so it draws one with the same places. */
export const placeTabsConfig = {
  screenOptions: { headerShown: false },
  tabBar: (props: BottomTabBarProps) => <TabBar {...props} />,
};

export const placeTab = (title: string, _symbol: string) => ({ title });

/** The bar sits below the scene here, so nothing needs room for it. */
export const useTabBarHeight = () => 0;

function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      className="flex-row border-t border-line bg-canvas"
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}
    >
      {state.routes.map((route, index) => {
        const current = index === state.index;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: current }}
            onPress={() => navigation.navigate(route.name)}
            className="h-14 flex-1 items-center justify-center gap-1 active:bg-sunken"
          >
            <View
              className={cn("h-0.5 w-6 rounded-full", current ? "bg-accent" : "bg-transparent")}
            />
            <Text
              className={cn(
                "type-callout font-medium",
                current ? "text-accent-text" : "text-muted",
              )}
            >
              {descriptors[route.key]!.options.title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
