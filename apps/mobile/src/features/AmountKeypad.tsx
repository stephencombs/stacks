import * as Match from "effect/Match";
import { useEffect, useRef } from "react";
import * as Haptics from "expo-haptics";
import { Platform, Pressable, Text, View } from "react-native";
import { useUniwind } from "uniwind";

import { Icon } from "../components/ui/Icon";
import { cn } from "../components/ui/cn";
import { holdBackspace } from "./holdBackspace";

const digitRows = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
] as const;

const DELETE_PRESS_SETTLE_MS = 300;

/** The keypad used at the table: digits, an optional decimal or sign, and delete. */
export function AmountKeypad({
  onKey,
  bottomLeft,
  tiled = false,
}: {
  onKey: (key: string) => void;
  /** A decimal mark, `"sign"` for ±, or nothing. */
  bottomLeft: string | null;
  tiled?: boolean;
}) {
  const { theme } = useUniwind();
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
    void Haptics.selectionAsync();
    releaseRepeat.current?.();
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

  const activateDelete = () => {
    deletePress.current += 1;

    if (deletedOnPressIn.current) {
      deletedOnPressIn.current = false;

      return;
    }

    void Haptics.selectionAsync();
    onKey("back");
  };

  const tap = (key: string) => {
    void Haptics.selectionAsync();
    onKey(key);
  };

  return (
    <View className={cn("w-full", tiled && "gap-1.5")}>
      {[...digitRows, [bottomLeft, "0", "back"]].map((row) => (
        <View
          key={row[1]}
          className={cn(
            "flex-row",
            tiled ? "h-[50px] gap-1.5" : Platform.OS === "android" ? "h-12" : "h-16",
          )}
        >
          {row.map((key) =>
            key === null ? (
              <View key="gap" className="flex-1" />
            ) : (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={Match.value(key).pipe(
                  Match.when("back", () => "Delete"),
                  Match.when("sign", () => "Plus or minus"),
                  Match.orElse((label) => label),
                )}
                cancelable={key === "back" ? false : undefined}
                onPressIn={key === "back" ? pressDelete : undefined}
                onPressOut={key === "back" ? releaseDelete : undefined}
                onPress={key === "back" ? activateDelete : () => tap(key)}
                className={cn(
                  "min-w-0 flex-1 items-center justify-center active:bg-fill-strong",
                  tiled
                    ? cn("rounded-[10px]", theme === "dark" ? "bg-fill" : "bg-surface")
                    : "rounded-full",
                )}
              >
                {key === "back" ? (
                  <Icon name="delete" color="ink" size={24} />
                ) : (
                  <Text
                    className={cn(
                      "text-ink",
                      tiled ? "text-[26px] font-normal" : "text-3xl font-medium",
                    )}
                  >
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
