import { View } from "react-native";

import { cn } from "./cn";
import type { GlassSurfaceProps } from "./glassSurfaceShared";

/**
 * Android has no glass: what floats is a solid Material surface, a step above the cards it passes
 * over and lifted by its shadow.
 */
export function GlassSurface({ children, className }: GlassSurfaceProps) {
  return <View className={cn("bg-raised shadow-md", className)}>{children}</View>;
}
