import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { Platform } from "react-native";

/** Whether this device draws the iOS 26 Liquid Glass chrome: the native bar, its items and its scroll-edge blur. */
export const isLiquidGlassSupported =
  Platform.OS === "ios" && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
