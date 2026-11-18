import type { ReactNode } from "react";
import { View } from "react-native";

/** The 56px floating action button and the 16px around it, which a list scrolls clear of. */
export const FAB_ROOM = 88;

/** A floating action button, bottom right. It keeps the width of its content. */
export function FloatingAction({
  right,
  bottom,
  children,
}: {
  right: number;
  bottom: number;
  children: ReactNode;
}) {
  return (
    <View pointerEvents="box-none" className="absolute" style={{ right, bottom }}>
      {children}
    </View>
  );
}
