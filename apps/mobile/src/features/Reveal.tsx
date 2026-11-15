import { useEffect, useState, type ReactNode } from "react";
import { Animated } from "react-native";

import { animate, ease } from "../components/ui/motion";

/**
 * Flips its content into place like a chip stack being racked, for a result landing. With Reduce
 * Motion on, or `animate` off, the content is simply there.
 */
export function Reveal({
  animate: play,
  delay = 0,
  children,
}: {
  animate: boolean;
  delay?: number;
  children: ReactNode;
}) {
  const [shown] = useState(() => new Animated.Value(play ? 0 : 1));
  useEffect(() => {
    if (play) animate(shown, { toValue: 1, delay, duration: 320, easing: ease.enter });
  }, [play, delay, shown]);
  return (
    <Animated.View
      style={{
        opacity: shown,
        transform: [
          { perspective: 400 },
          { rotateX: shown.interpolate({ inputRange: [0, 1], outputRange: ["-90deg", "0deg"] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
