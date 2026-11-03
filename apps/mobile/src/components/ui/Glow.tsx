import { StyleSheet } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useCSSVariable } from "uniwind";

/** A soft light behind a hero card's figure, in the color of how it's going. Put it first inside an `overflow-hidden` card. */
export function Glow({ tone }: { tone: "win" | "loss" | "accent" }) {
  const color = String(useCSSVariable(`--color-${tone}`));
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="glow" cx="90%" cy="0%" rx="70%" ry="60%">
          <Stop offset="0" stopColor={color} stopOpacity={0.22} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#glow)" />
    </Svg>
  );
}
