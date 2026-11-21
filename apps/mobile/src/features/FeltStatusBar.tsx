import { useIsFocused } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";

/**
 * Light icons on the dark green of a live session, in either theme. A screen pushed over the felt
 * leaves it mounted, so it only draws while focused and the app's own bar returns after.
 */
export function FeltStatusBar({ felt }: { felt: boolean }) {
  const focused = useIsFocused();

  return felt && focused && Platform.OS === "android" ? <StatusBar style="light" /> : null;
}
