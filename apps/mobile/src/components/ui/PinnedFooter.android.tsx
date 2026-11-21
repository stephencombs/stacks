import { useState } from "react";
import { View } from "react-native";

import { cn } from "./cn";
import type { PinnedFooterProps } from "./PinnedFooter";
import { pinnedFooterChrome } from "./pinnedFooterChrome";

/**
 * Material pins actions on a surface with a top edge, so the list, the live bar and the toasts
 * behind it never show through. With nothing to show it draws no surface at all.
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
      onLayout={onLayout}
      className={cn(
        "absolute inset-x-0 bottom-0",
        pinnedFooterChrome({ filled, felt, surface: true }),
      )}
      style={{ paddingLeft: 16, paddingRight: 16, ...sides, paddingBottom: inset }}
    >
      <View className="gap-2" onLayout={(event) => setFilled(event.nativeEvent.layout.height > 0)}>
        {children}
      </View>
    </View>
  );
}
