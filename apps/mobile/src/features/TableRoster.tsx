import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { Chip } from "./Chip";

export function TableRosterRow({
  name,
  chip = 0,
  you = false,
  status,
  trailing,
  onPress,
  accessibilityHint,
}: {
  name: string;
  chip?: number;
  you?: boolean;
  status: string;
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityHint?: string;
}) {
  return (
    <View className="flex-row items-center gap-3 border-t border-line pr-3">
      <Pressable
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={`${name}${you ? ", you" : ""}, ${status}`}
        accessibilityHint={accessibilityHint}
        disabled={!onPress}
        onPress={onPress}
        className="min-h-16 min-w-0 flex-1 flex-row items-center gap-3 py-3 pl-4 active:bg-sunken"
      >
        <Chip chip={chip} name={name} size={30} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text numberOfLines={1} className="type-body font-medium text-ink">
            {name}
            {you ? " · you" : ""}
          </Text>
          <Text className="type-footnote text-muted tabular-nums">{status}</Text>
        </View>
      </Pressable>
      {trailing}
    </View>
  );
}
