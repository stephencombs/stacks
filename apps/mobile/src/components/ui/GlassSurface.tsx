import type { ReactNode } from "react";
import { View } from "react-native";

import { cn } from "./cn";

export type GlassSurfaceProps = {
  children?: ReactNode;
  /** Shape and layout. Give the rounding as a class too, for the platforms drawn without glass. */
  className?: string;
  /** The corner radius iOS draws the glass with. */
  radius?: number;
  /** Lets iOS glass answer a touch, for a surface that is itself a control. */
  interactive?: boolean;
};

/** Glass without the native material: the glass token's translucent fill, an edge and the float shadow. */
export const glassFill = "border border-line bg-glass shadow-lg";

/**
 * Liquid Glass, for what floats over content: the tab bar, the LiveBar, top controls, menus and the
 * keypad. Never the bottom actions. iOS draws the native material; elsewhere it's a translucent fill.
 */
export function GlassSurface({ children, className }: GlassSurfaceProps) {
  return <View className={cn(glassFill, className)}>{children}</View>;
}
