import { createBottomTabNavigator, type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cn } from "../components/ui/cn";
import { Icon, type IconName } from "../components/ui/Icon";

export const createPlaceTabs = createBottomTabNavigator;

export const placeTabsConfig = {
  screenOptions: { headerShown: false },
  tabBar: (props: BottomTabBarProps) => <FloatingCapsuleTabBar {...props} />,
};

export const placeTab = (title: string, _symbol: string) => ({ title });

/** The capsule floats over the scene, so every place pads clear of it. */
export function useTabBarHeight() {
  const insets = useSafeAreaInsets();
  return 68 + Math.max(insets.bottom, 12);
}

const tabIcons: Record<string, IconName> = {
  PlayTab: "sessions",
  StatsTab: "stats",
  MapTab: "map",
  CrewTab: "group",
};

function FloatingCapsuleTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 bottom-0 items-center px-5"
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
    >
      <View
        accessibilityRole="tablist"
        className="w-full max-w-md flex-row items-center rounded-full border border-line bg-surface/95 p-1.5 shadow-lg"
      >
        {state.routes.map((route, index) => {
          const current = index === state.index;
          const title = descriptors[route.key]!.options.title ?? route.name;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={title}
              accessibilityState={{ selected: current }}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!current && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
              className={cn(
                "min-h-11 flex-1 items-center justify-center rounded-full py-2 active:scale-[0.95]",
                current && "bg-fill",
              )}
            >
              <Icon
                name={tabIcons[route.name]!}
                color={current ? "ink" : "muted"}
                size={20}
                filled={current}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
