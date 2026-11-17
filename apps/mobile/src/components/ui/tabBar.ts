import { createContext, use } from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** How tall the tab bar is under the current screen: zero outside the places. */
export const TabBarHeight = createContext(0);

/**
 * How far the foot of a screen must stay clear: the tab bar where there is one, else the system
 * gesture inset, never less than `minimum`. Anything pinned or padded at the bottom of a screen
 * uses this, so no screen draws under a bar.
 */
export function useBottomClearance(minimum = 0) {
  const bar = use(TabBarHeight);
  const { bottom } = useSafeAreaInsets();
  return bar || Math.max(bottom, minimum);
}

/**
 * Where a list ends relative to the tab bar. Android's navigation bar is opaque, so the list
 * stops above it (`margin`) and nothing scrolls under, or can be tapped through, the bar. iOS's
 * is glass the list scrolls under, so it pads its end instead. `live` is the LiveBar's height;
 * on Android it floats 8 above whatever it sits on. `spacer` is the padding a list adds after its
 * last row, `above` the same when a footer holds the foot instead of the bar, and `fab` where a
 * floating action button sits.
 */
export function useListEnd(live: number) {
  const bar = use(TabBarHeight);
  const floating = live > 0 ? live + 8 : 0;
  if (Platform.OS === "android")
    return { margin: bar, spacer: floating, above: floating, fab: bar + floating + 16 };
  return { margin: 0, spacer: bar + live, above: live, fab: bar + floating + 16 };
}
