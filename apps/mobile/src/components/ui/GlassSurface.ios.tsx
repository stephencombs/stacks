import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { View } from "react-native";
import { useUniwind, withUniwind } from "uniwind";

import type { GlassSurfaceProps } from "./GlassSurface";
import { cn } from "./cn";

const NativeGlass = withUniwind(GlassView);

export function GlassSurface({
  children,
  className,
  fallbackClassName,
  radius = 999,
}: GlassSurfaceProps) {
  const { theme } = useUniwind();
  if (!isLiquidGlassAvailable() || !isGlassEffectAPIAvailable())
    return <View className={cn(fallbackClassName, className)}>{children}</View>;
  return (
    <NativeGlass
      colorScheme={theme === "light" ? "light" : "dark"}
      isInteractive
      className={className}
      style={{ borderRadius: radius }}
    >
      {children}
    </NativeGlass>
  );
}
