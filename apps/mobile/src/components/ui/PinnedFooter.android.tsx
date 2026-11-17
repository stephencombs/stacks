import { View } from "react-native";

import { cn } from "./cn";
import type { PinnedFooterProps } from "./PinnedFooter";

/**
 * Material pins actions on a surface with a top edge, so the list, the live bar and the toasts
 * behind it never show through.
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
      onLayout={onLayout}
      className={cn(
        "absolute inset-x-0 bottom-0 gap-2 pt-3",
        felt ? "bg-felt" : "border-t border-line bg-canvas",
      )}
      style={{ paddingLeft: 16, paddingRight: 16, ...sides, paddingBottom: inset }}
    >
      {children}
    </View>
  );
}
