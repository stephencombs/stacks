import type { ReactNode } from "react";
import { View } from "react-native";
import { ScopedTheme } from "uniwind";

import { BrandWordmark } from "../components/BrandWordmark";

/** A card is drawn at this size in logical pixels and captured at 1080×1350 physical pixels. */
export const CARD_WIDTH = 360;
export const CARD_HEIGHT = 450;

/**
 * The felt a share card is drawn on. It is pinned to the dark theme, so a card shared from the
 * light theme looks the same, and its small wordmark sits at the bottom with no glow or gradient.
 */
export function CardFrame({ children }: { children: ReactNode }) {
  return (
    <ScopedTheme theme="dark">
      <View
        style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
        className="justify-between overflow-hidden bg-felt p-6"
      >
        <View className="flex-1 justify-between gap-3">{children}</View>
        <View className="pt-3">
          <BrandWordmark felt width={72} />
        </View>
      </View>
    </ScopedTheme>
  );
}
