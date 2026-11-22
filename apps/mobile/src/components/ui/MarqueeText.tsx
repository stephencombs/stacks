import { useEffect, useState } from "react";
import { Animated, Easing, ScrollView, View } from "react-native";

import { Text } from "./Text";
import { useReducedMotion } from "./motion";

const SPEED = 34;
const START_PAUSE = 2500;
const END_PAUSE = 1500;

/** How far the text overflows its box, or 0 when it fits. */
export const overflowOf = (textWidth: number, boxWidth: number) =>
  textWidth > boxWidth && boxWidth > 0 ? textWidth - boxWidth : 0;

const travelMs = (distance: number) => (distance / SPEED) * 1000;

/**
 * One line of text that fits or scrolls: when it's wider than its box it pauses, slides to its end,
 * pauses and slides back, forever. With Reduce Motion on it truncates instead.
 */
export function MarqueeText({ children, className }: { children: string; className?: string }) {
  const reduced = useReducedMotion();
  const [boxWidth, setBoxWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const [x] = useState(() => new Animated.Value(0));
  const distance = overflowOf(textWidth, boxWidth);

  useEffect(() => {
    if (distance === 0) return;

    const slide = (toValue: number) =>
      Animated.timing(x, {
        toValue,
        duration: travelMs(distance),
        easing: Easing.linear,
        useNativeDriver: true,
      });

    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(START_PAUSE),
        slide(-distance),
        Animated.delay(END_PAUSE),
        slide(0),
      ]),
    );

    loop.start();

    return () => {
      loop.stop();
      x.setValue(0);
    };
  }, [distance, x]);

  if (reduced)
    return (
      <Text numberOfLines={1} ellipsizeMode="tail" className={className}>
        {children}
      </Text>
    );

  return (
    <View
      className="min-w-0 shrink overflow-hidden"
      onLayout={(event) => setBoxWidth(event.nativeEvent.layout.width)}
    >
      <ScrollView
        horizontal
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={setTextWidth}
      >
        <Animated.View style={{ transform: [{ translateX: x }] }}>
          <Text numberOfLines={1} className={className}>
            {children}
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
