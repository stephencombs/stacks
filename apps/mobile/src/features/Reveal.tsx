import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";

/**
 * Flips its content into place like a chip stack being racked, for a result landing. With Reduce
 * Motion on, or `animate` off, the content is simply there.
 */
export function Reveal({
  animate,
  delay = 0,
  children,
}: {
  animate: boolean;
  delay?: number;
  children: ReactNode;
}) {
  const [shown] = useState(() => new Animated.Value(animate ? 0 : 1));
  useEffect(() => {
    if (!animate) return;
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!live) return;
      if (reduce) return shown.setValue(1);
      Animated.timing(shown, {
        toValue: 1,
        delay,
        duration: 320,
        easing: Easing.bezier(0.32, 0.72, 0, 1),
        useNativeDriver: true,
      }).start();
    });
    return () => {
      live = false;
    };
  }, [animate, delay, shown]);
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
