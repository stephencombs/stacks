import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { useEffect, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { useUniwind, withUniwind } from "uniwind";

import { glassFill, type GlassSurfaceProps } from "./glassSurfaceShared";
import { cn } from "./cn";

const NativeGlass = withUniwind(GlassView);

export function GlassSurface({
  children,
  className,
  radius = 999,
  interactive = false,
}: GlassSurfaceProps) {
  const { theme } = useUniwind();
  const solid = useReduceTransparency();

  if (solid)
    return (
      <View className={cn("border border-line bg-surface shadow-lg", className)}>{children}</View>
    );

  if (!isLiquidGlassAvailable() || !isGlassEffectAPIAvailable())
    return <View className={cn(glassFill, className)}>{children}</View>;

  return (
    <NativeGlass
      colorScheme={theme === "light" ? "light" : "dark"}
      isInteractive={interactive}
      className={className}
      style={{ borderRadius: radius }}
    >
      {children}
    </NativeGlass>
  );
}

function useReduceTransparency() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then((value) => {
      if (live) setReduce(value);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setReduce);

    return () => {
      live = false;
      subscription.remove();
    };
  }, []);

  return reduce;
}
