import type { ReactNode } from "react";
import { View } from "react-native";

import { Icon } from "../components/ui/Icon";
import { Text } from "../components/ui/Text";
import { cn } from "../components/ui/cn";

/**
 * The line under a typed amount. It keeps its height when empty, so the first digit, an error or a
 * preview never moves the keypad or the action under the thumb. `lines` is the most it shows.
 */
export function AmountFeedback({
  error,
  hint,
  lines = 1,
}: {
  error: string | null;
  hint?: ReactNode;
  lines?: 1 | 2;
}) {
  return (
    <View
      accessibilityLiveRegion="polite"
      className={cn("justify-center px-1", lines === 2 ? "min-h-10" : "min-h-5")}
    >
      {error ? (
        <View className="flex-row justify-center gap-1.5">
          <Icon name="alert" color="loss" size={14} />
          <Text className="type-footnote text-loss">{error}</Text>
        </View>
      ) : hint ? (
        <Text className="text-center type-footnote text-muted">{hint}</Text>
      ) : null}
    </View>
  );
}
