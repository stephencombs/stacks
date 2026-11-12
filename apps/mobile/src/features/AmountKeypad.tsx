import { useEffect, useRef } from "react";
import * as Haptics from "expo-haptics";
import { Platform, Pressable, Text, View } from "react-native";

import { Icon } from "../components/ui/Icon";
import { holdBackspace } from "./holdBackspace";

const digitRows = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
] as const;

// A click can follow pointer-up as its own event. Remember the press-in delete
// until that click arrives, so a tap doesn't remove a second character.
const DELETE_PRESS_SETTLE_MS = 300;

/** The keypad used at the table: digits, an optional decimal or sign, and delete. */
export function AmountKeypad({
  onKey,
  bottomLeft,
}: {
  onKey: (key: string) => void;
  /** A decimal mark, `"sign"` for ±, or nothing. */
  bottomLeft: string | null;
}) {
  const releaseRepeat = useRef<(() => void) | null>(null);
  const deletePress = useRef(0);
  const deletedOnPressIn = useRef(false);
  const settleDelete = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      releaseRepeat.current?.();
      if (settleDelete.current !== null) clearTimeout(settleDelete.current);
    },
    [],
  );

  const pressDelete = () => {
    deletePress.current += 1;
    deletedOnPressIn.current = true;
    if (Platform.OS !== "web") void Haptics.selectionAsync();
    releaseRepeat.current?.();
    // Empty is a no-op in the parent, which applies each delete to the latest amount.
    releaseRepeat.current = holdBackspace(() => {
      onKey("back");
      return false;
    });
  };

  const releaseDelete = () => {
    releaseRepeat.current?.();
    releaseRepeat.current = null;
    if (settleDelete.current !== null) clearTimeout(settleDelete.current);
    const seen = deletePress.current;
    settleDelete.current = setTimeout(() => {
      settleDelete.current = null;
      if (deletePress.current === seen) deletedOnPressIn.current = false;
    }, DELETE_PRESS_SETTLE_MS);
  };

  // VoiceOver and keyboard activation fire onPress without a press-in.
  const activateDelete = () => {
    deletePress.current += 1;
    if (deletedOnPressIn.current) {
      deletedOnPressIn.current = false;
      return;
    }
    if (Platform.OS !== "web") void Haptics.selectionAsync();
    onKey("back");
  };

  const tap = (key: string) => {
    if (Platform.OS !== "web") void Haptics.selectionAsync();
    onKey(key);
  };

  return (
    <View className="w-full">
      {[...digitRows, [bottomLeft, "0", "back"]].map((row) => (
        <View key={row[1]} className="h-16 flex-row">
          {row.map((key) =>
            key === null ? (
              <View key="gap" className="flex-1" />
            ) : (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={
                  key === "back" ? "Delete" : key === "sign" ? "Plus or minus" : key
                }
                // The sheet scrolls; a stolen press would stop a held delete.
                cancelable={key === "back" ? false : undefined}
                onPressIn={key === "back" ? pressDelete : undefined}
                onPressOut={key === "back" ? releaseDelete : undefined}
                onPress={key === "back" ? activateDelete : () => tap(key)}
                className="min-w-0 flex-1 items-center justify-center rounded-full active:bg-fill"
              >
                {key === "back" ? (
                  <Icon name="delete" color="ink" size={24} />
                ) : (
                  <Text className="text-3xl font-medium text-ink">
                    {key === "sign" ? "±" : key}
                  </Text>
                )}
              </Pressable>
            ),
          )}
        </View>
      ))}
    </View>
  );
}
