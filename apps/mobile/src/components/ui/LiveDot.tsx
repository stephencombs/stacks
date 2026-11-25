import { useEffect, useState } from "react";
import { Animated, View } from "react-native";

import { duration, ease, useReducedMotion } from "./motion";

/**
 * The dot that says play is happening now: a felt-green point with a ring that swells and fades,
 * the one thing in the app that moves on its own. With Reduce Motion on it is just the point.
 */
export function LiveDot() {
  const reduced = useReducedMotion();
  const [swell] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduced) return;

    const loop = Animated.loop(
      Animated.timing(swell, {
        toValue: 1,
        duration: duration.pulse,
        easing: ease.enter,
        useNativeDriver: true,
      }),
    );

    loop.start();

    return () => {
      loop.stop();
      swell.setValue(0);
    };
  }, [reduced, swell]);

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      className="size-4 items-center justify-center"
    >
      {reduced ? null : (
        <Animated.View
          className="absolute size-2 rounded-full bg-live"
          style={{
            opacity: swell.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
            transform: [
              { scale: swell.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) },
            ],
          }}
        />
      )}
      <View className="size-2 rounded-full bg-live" />
    </View>
  );
}
