import { createContext, use, useState } from "react";
import { Platform, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FAB_ROOM } from "./FloatingAction";

/** How tall the tab bar is under the current screen: zero outside the places. */
export const TabBarHeight = createContext(0);

type FootInput = {
  platform: string;
  /** The tab bar, or zero. */
  bar: number;
  /** The system gesture inset. */
  inset: number;
  /** Whether a pinned footer holds the foot of the screen, and how tall it is. */
  footer: number | null;
  fab: boolean;
  /** The LiveBar's height, or zero. */
  live: number;
  /** Room under a footer's buttons beyond the bar or inset. */
  footerGap: number;
};

/** The arithmetic behind `useScreenFoot`, apart from the state, for tests. */
export function screenFoot({ platform, bar, inset, footer, fab, live, footerGap }: FootInput) {
  const android = platform === "android";
  // On Android the LiveBar floats 8 above whatever it sits on; on iOS the list pads by its height.
  const floating = live > 0 ? live + 8 : 0;
  // What sits at the foot of the screen: a footer, else the tab bar. The LiveBar, toasts and the
  // FAB stack above it.
  const base = footer ?? bar;
  const listEnd =
    footer !== null ? footer + (android ? floating : live) : android ? floating : bar + live;
  return {
    /** Android's tab bar is opaque, so a list stops above it; iOS's is glass the list scrolls under. */
    scrollStyle: footer === null && android && bar > 0 ? { marginBottom: bar } : undefined,
    /** Height of the empty space a list leaves after its last row. */
    endSpace: listEnd + (fab ? FAB_ROOM : 0),
    /** Space below a footer's buttons. */
    footerInset: (bar || Math.max(inset, 12)) + footerGap,
    /** Where the FAB's bottom edge sits. */
    fabBottom: base + floating + 16,
    /** Where the LiveBar and toasts sit above, or undefined to sit on the screen's own edge. */
    above: footer !== null ? footer : bar || undefined,
    /** What a pinned block with no footer or list, like the signed-out intro, pads its foot by. */
    clearance: android ? bar || inset : inset,
  };
}

/**
 * Everything the foot of a screen needs, from one place, so no screen redoes the arithmetic: how
 * a list ends, where the footer, the FAB and the LiveBar sit, and how far to stay clear of the tab
 * bar or home indicator. Wire `onFooterLayout` to the pinned footer and `onLiveBarHeight` to the
 * LiveBar; `footerGap` is room under a footer's buttons beyond the bar.
 */
export function useScreenFoot({
  footer = false,
  fab = false,
  footerGap = 0,
}: { footer?: boolean; fab?: boolean; footerGap?: number } = {}) {
  const bar = use(TabBarHeight);
  const { bottom } = useSafeAreaInsets();
  const [footerHeight, setFooterHeight] = useState(0);
  const [live, setLive] = useState(0);
  return {
    ...screenFoot({
      platform: Platform.OS,
      bar,
      inset: bottom,
      footer: footer ? footerHeight : null,
      fab,
      live,
      footerGap,
    }),
    onFooterLayout: (event: LayoutChangeEvent) => setFooterHeight(event.nativeEvent.layout.height),
    onLiveBarHeight: setLive,
  };
}
