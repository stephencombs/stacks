import { NavigationContext, useIsFocused } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { use, useLayoutEffect } from "react";
import { Platform } from "react-native";
import { useUniwind } from "uniwind";

/**
 * Light icons on the dark green of a live session, in either theme. A screen pushed over the felt
 * leaves it mounted, so it only draws while focused and the app's own bar returns after.
 */
export function FeltStatusBar({ felt }: { felt: boolean }) {
  const focused = useIsFocused();
  const navigation = use(NavigationContext);
  const { theme } = useUniwind();

  useLayoutEffect(() => {
    if (Platform.OS !== "ios" || !navigation) return;
    navigation.setOptions({
      statusBarStyle: felt && focused ? "light" : theme === "light" ? "dark" : "light",
    });
  }, [navigation, felt, focused, theme]);

  return felt && focused ? <StatusBar style="light" /> : null;
}
