import { useState, type ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";

import { cn } from "./cn";
import { pinnedFooterChrome } from "./pinnedFooterChrome";

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
  const [filled, setFilled] = useState(false);

  return (
    <View
      pointerEvents={filled ? "auto" : "box-none"}
      onLayout={onLayout}
      className={cn(
        "absolute inset-x-0 bottom-0",
        pinnedFooterChrome({ filled, felt, surface: false }),
      )}
      style={{ paddingLeft: 16, paddingRight: 16, ...sides, paddingBottom: inset }}
    >
      <View
        pointerEvents="box-none"
        className="gap-2"
        onLayout={(event) => setFilled(event.nativeEvent.layout.height > 0)}
      >
        {children}
      </View>
    </View>
  );
}
