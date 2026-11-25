import { useEffect, useRef, type ComponentProps } from "react";
import { Pressable, View } from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";

import { cn } from "./cn";
import { Icon, type IconName } from "./Icon";
import { Row } from "./Surface";
import { Text } from "./Text";

export type SwipeAction = {
  readonly label: string;
  readonly icon: IconName;
  readonly destructive?: boolean;
  readonly onPress: () => void;
};

const none: ReadonlyArray<SwipeAction> = [];

let openRow: SwipeableMethods | null = null;

/**
 * A List row that swipes sideways to show its actions, like a conversation in Messages: leading
 * actions behind a swipe right, trailing ones behind a swipe left. One row is open at a time, a
 * tap on an open row closes it, and the same actions are offered to VoiceOver and TalkBack.
 */
export function SwipeRow({
  leading = none,
  trailing = none,
  onPress,
  ...row
}: ComponentProps<typeof Row> & {
  leading?: ReadonlyArray<SwipeAction>;
  trailing?: ReadonlyArray<SwipeAction>;
}) {
  const swipeable = useRef<SwipeableMethods>(null);
  const open = useRef(false);
  const actions = [...leading, ...trailing];

  useEffect(
    () => () => {
      if (openRow === swipeable.current) openRow = null;
    },
    [],
  );

  if (actions.length === 0) return <Row {...row} onPress={onPress} />;

  const run = (action: SwipeAction) => {
    swipeable.current?.close();
    action.onPress();
  };

  const panel = (side: ReadonlyArray<SwipeAction>) =>
    side.length === 0
      ? undefined
      : () => (
          <View
            className="flex-row"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {side.map((action) => (
              <Pressable
                key={action.label}
                onPress={() => run(action)}
                className={cn(
                  "w-20 items-center justify-center gap-1 px-1 active:opacity-80",
                  action.destructive ? "bg-chip-red" : "bg-chip-blue",
                )}
              >
                <Icon name={action.icon} color="felt-ink" size={20} />
                <Text
                  numberOfLines={2}
                  className="text-center type-footnote font-semibold text-felt-ink"
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        );

  return (
    <ReanimatedSwipeable
      ref={swipeable}
      friction={1}
      overshootFriction={8}
      leftThreshold={40}
      rightThreshold={40}
      renderLeftActions={panel(leading)}
      renderRightActions={panel(trailing)}
      onSwipeableWillOpen={() => {
        if (openRow !== swipeable.current) openRow?.close();

        openRow = swipeable.current;
        open.current = true;
      }}
      onSwipeableClose={() => {
        open.current = false;

        if (openRow === swipeable.current) openRow = null;
      }}
    >
      <View className="bg-surface">
        <Row
          {...row}
          onPress={
            onPress &&
            (() => {
              if (open.current) swipeable.current?.close();
              else onPress();
            })
          }
          accessibilityActions={actions.map((action) => ({
            name: action.label,
            label: action.label,
          }))}
          onAccessibilityAction={(event) =>
            actions.find((action) => action.label === event.nativeEvent.actionName)?.onPress()
          }
        />
      </View>
    </ReanimatedSwipeable>
  );
}
