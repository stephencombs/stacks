import { View } from "react-native";

import { cn } from "./cn";
import { glassFill, type GlassSurfaceProps } from "./glassSurfaceShared";

/**
 * Liquid Glass, for what floats over content: the tab bar, the LiveBar, top controls, menus and the
 * keypad. Never the bottom actions. iOS draws the native material; elsewhere it's a translucent fill.
 */
export function GlassSurface({ children, className }: GlassSurfaceProps) {
  return <View className={cn(glassFill, className)}>{children}</View>;
}
