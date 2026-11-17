import type { ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";

import { cn } from "./cn";

export type PinnedFooterProps = {
  /** Space below the buttons: a tab bar or the home indicator. */
  inset: number;
  /** Left and right padding. */
  sides?: { paddingLeft: number; paddingRight: number };
  /** On the felt, the footer takes its colour. */
  felt?: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
  children: ReactNode;
};

/**
 * A screen's main actions, pinned to its foot above the tab bar or home indicator. On iOS they
 * float over the content; Android draws them on a surface (`PinnedFooter.android.tsx`).
 */
export function PinnedFooter({
  inset,
  sides,
  felt = false,
  onLayout,
  children,
}: PinnedFooterProps) {
  return (
    <View
      pointerEvents="box-none"
      onLayout={onLayout}
      className={cn("absolute inset-x-0 bottom-0 gap-2 pt-3", felt && "bg-felt")}
      style={{ paddingLeft: 16, paddingRight: 16, ...sides, paddingBottom: inset }}
    >
      {children}
    </View>
  );
}
