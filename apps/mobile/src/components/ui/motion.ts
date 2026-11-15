import { duration, easing, pressScale } from "@stacks/client-runtime/motion";
import { useSyncExternalStore } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";

export { duration, pressScale };

export const ease = {
  enter: Easing.bezier(...easing.enter),
  exit: Easing.bezier(...easing.exit),
  press: Easing.bezier(...easing.press),
};

// The one reduced-motion switch. Every animation goes through `animate`, which jumps to the end
// while Reduce Motion is on. The setting is read once, on first use, and followed after that.
let reduced = false;
let watching = false;
const listeners = new Set<() => void>();

function watch() {
  if (watching) return;
  watching = true;
  const apply = (value: boolean) => {
    reduced = value;
    for (const listener of listeners) listener();
  };
  void AccessibilityInfo.isReduceMotionEnabled().then(apply);
  AccessibilityInfo.addEventListener("reduceMotionChanged", apply);
}

function subscribe(listener: () => void) {
  watch();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether Reduce Motion is on, for motion that isn't a single `animate`, like a pager's scroll. */
export const useReducedMotion = () => useSyncExternalStore(subscribe, () => reduced);

/** The same, read at the moment, for a sequence that plays outside render. */
export const isReducedMotion = () => {
  watch();
  return reduced;
};

/**
 * Runs a transform or opacity animation on the native driver, or, with Reduce Motion on, sets the
 * end value at once. `done` runs either way, with whether the value reached the end.
 */
export function animate(
  value: Animated.Value,
  config: {
    toValue: number;
    duration: number;
    easing: (t: number) => number;
    delay?: number;
  },
  done?: (finished: boolean) => void,
) {
  watch();
  value.stopAnimation();
  if (reduced) {
    value.setValue(config.toValue);
    done?.(true);
    return;
  }
  Animated.timing(value, { ...config, useNativeDriver: true }).start(({ finished }) =>
    done?.(finished),
  );
}
