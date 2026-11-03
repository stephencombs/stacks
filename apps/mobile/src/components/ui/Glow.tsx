import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useCSSVariable } from "uniwind";

/** A soft light behind a hero card's figure, in the color of how it's going. Put it first inside an `overflow-hidden` card. */
export function Glow({ tone }: { tone: "win" | "loss" | "accent" }) {
  const color = String(useCSSVariable(`--color-${tone}`));
  const [size, setSize] = useState({ width: 0, height: 0 });
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width !== size.width || height !== size.height) setSize({ width, height });
      }}
    >
      {size.width > 0 ? (
        <Svg width={size.width} height={size.height}>
          <Defs>
            <RadialGradient id="glow" cx="90%" cy="0%" rx="70%" ry="60%">
              <Stop offset="0" stopColor={color} stopOpacity={0.22} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={size.width} height={size.height} fill="url(#glow)" />
        </Svg>
      ) : null}
    </View>
  );
}
