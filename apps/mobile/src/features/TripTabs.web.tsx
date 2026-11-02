import { createBottomTabNavigator, type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useIsFocused } from "@react-navigation/native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cn } from "../components/ui/cn";
import { tripTabs, type TripTab } from "./tripTabs";

const Tabs = createBottomTabNavigator();

/**
 * Hidden tabs stay mounted behind the shown one; on the web they'd still be in the page, so only
 * the shown tab draws. The bar sits below the scene here, so nothing needs room for it.
 */
function Shown({ children }: { children: ReactNode }) {
  return useIsFocused() ? children : null;
}

/** The web build has no system tab bar, so it draws one in the same places. */
export function TripTabs({
  initial,
  render,
}: {
  initial: TripTab;
  render: (tab: TripTab, barHeight: number) => ReactNode;
}) {
  return (
    <Tabs.Navigator
      initialRouteName={tripTabs[initial].route}
      screenOptions={{ headerShown: false }}
      tabBar={renderTabBar}
    >
      {(Object.keys(tripTabs) as ReadonlyArray<TripTab>).map((tab) => (
        <Tabs.Screen key={tab} name={tripTabs[tab].route} options={{ title: tripTabs[tab].label }}>
          {() => <Shown>{render(tab, 0)}</Shown>}
        </Tabs.Screen>
      ))}
    </Tabs.Navigator>
  );
}

const renderTabBar = (props: BottomTabBarProps) => <TabBar {...props} />;

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
            <View className={cn("h-0.5 w-6 rounded-full", current ? "bg-ink" : "bg-transparent")} />
            <Text
              className={cn(
                "text-[15px]",
                current ? "font-semibold text-ink" : "font-medium text-muted",
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
