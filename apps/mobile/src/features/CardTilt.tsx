import type { ReactNode } from "react";
import Animated, {
  SensorType,
  useAnimatedReaction,
  useAnimatedSensor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { useReducedMotion } from "../components/ui/motion";

const GRAVITY = 9.81;
const MAX_TILT = 10;
const DEGREES_PER_G = 40;
const SETTLE_PER_READING = 0.01;

const spring = { damping: 18, stiffness: 160, mass: 0.6 };

const clamp = (value: number) => {
  "worklet";

  return Math.min(MAX_TILT, Math.max(-MAX_TILT, value));
};

/**
 * Tilts its children with the phone's movement. Tilt is measured from how the phone has been held
 * lately, not from flat, so it answers a turn of the wrist at any holding angle and eases back to
 * level when the phone is still. Reduce Motion leaves it flat and the sensor off.
 */
export function CardTilt({ children }: { children: ReactNode }) {
  return useReducedMotion() ? children : <Tilting>{children}</Tilting>;
}

function Tilting({ children }: { children: ReactNode }) {
  const { sensor } = useAnimatedSensor(SensorType.GRAVITY, { interval: 16 });
  const rest = useSharedValue<{ x: number; y: number } | null>(null);
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);

  useAnimatedReaction(
    () => sensor.get(),
    ({ x: rawX, y: rawY }) => {
      if (rawX === 0 && rawY === 0) return;

      const x = rawX / GRAVITY;
      const y = rawY / GRAVITY;
      const from = rest.get() ?? { x, y };

      rest.set({
        x: from.x + (x - from.x) * SETTLE_PER_READING,
        y: from.y + (y - from.y) * SETTLE_PER_READING,
      });
      tiltX.set(withSpring(clamp((y - from.y) * DEGREES_PER_G), spring));
      tiltY.set(withSpring(clamp((from.x - x) * DEGREES_PER_G), spring));
    },
  );

  const tilt = useAnimatedStyle(() => ({
    transform: [
      { perspective: 900 },
      { rotateX: `${tiltX.get()}deg` },
      { rotateY: `${tiltY.get()}deg` },
    ],
  }));

  return <Animated.View style={tilt}>{children}</Animated.View>;
}
