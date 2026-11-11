import type { ReactNode } from "react";
import { View } from "react-native";

import { cn } from "./cn";

export type GlassSurfaceProps = {
  children: ReactNode;
  className?: string;
  fallbackClassName?: string;
  radius?: number;
};

export function GlassSurface({ children, className, fallbackClassName }: GlassSurfaceProps) {
  return <View className={cn(fallbackClassName, className)}>{children}</View>;
}
