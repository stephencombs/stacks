import type { ReactNode } from "react";
import { View } from "react-native";

/** The round surface under a 44px icon control: Material's filled tonal icon button. */
export function ControlSurface({ children }: { children: ReactNode }) {
  return (
    <View className="size-11 items-center justify-center rounded-full bg-fill">{children}</View>
  );
}
