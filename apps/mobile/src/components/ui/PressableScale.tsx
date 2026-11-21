import { useState } from "react";
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { animate, duration, ease, pressScale } from "./motion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** A Pressable that shrinks while it's held: down quickly, back up a little slower. */
export function PressableScale({
  onPressIn,
  onPressOut,
  style,
  ...props
}: Omit<PressableProps, "style"> & { style?: StyleProp<ViewStyle> }) {
  const [scale] = useState(() => new Animated.Value(1));

  return (
    <AnimatedPressable
      {...props}
      onPressIn={(event) => {
        animate(scale, { toValue: pressScale, duration: duration.pressDown, easing: ease.press });
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        animate(scale, { toValue: 1, duration: duration.pressUp, easing: ease.enter });
        onPressOut?.(event);
      }}
      style={[style, { transform: [{ scale }] }]}
    />
  );
}
