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
  const floating = live > 0 ? live + 8 : 0;
  const base = footer ?? bar;

  const listEnd =
    footer !== null ? footer + (android ? floating : live) : android ? floating : bar + live;

  return {
    scrollStyle: footer === null && android && bar > 0 ? { marginBottom: bar } : undefined,
    endSpace: listEnd + (fab ? FAB_ROOM : 0),
    footerInset: (bar || Math.max(inset, 12)) + footerGap,
    fabBottom: base + floating + 16,
    above: footer !== null ? footer : bar || undefined,
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
