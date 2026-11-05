import * as Haptics from "expo-haptics";
import { Platform, Pressable, Text, View } from "react-native";

import { Icon } from "../components/ui/Icon";

const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** The keypad used at the table: digits, an optional decimal or sign, and delete. */
export function AmountKeypad({
  onKey,
  bottomLeft,
}: {
  onKey: (key: string) => void;
  /** A decimal mark, `"sign"` for ±, or nothing. */
  bottomLeft: string | null;
}) {
  const tap = (key: string) => {
    if (Platform.OS !== "web") void Haptics.selectionAsync();
    onKey(key);
  };
  return (
    <View className="flex-row flex-wrap">
      {[...digits, bottomLeft, "0", "back"].map((key) =>
        key === null ? (
          <View key="gap" className="h-16 basis-1/3" />
        ) : (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={key === "back" ? "Delete" : key === "sign" ? "Plus or minus" : key}
            onPress={() => tap(key)}
            className="h-16 basis-1/3 items-center justify-center rounded-full active:bg-fill"
          >
            {key === "back" ? (
              <Icon name="delete" color="ink" size={24} />
            ) : (
              <Text className="text-3xl font-medium text-ink">{key === "sign" ? "±" : key}</Text>
            )}
          </Pressable>
        ),
      )}
    </View>
  );
}
