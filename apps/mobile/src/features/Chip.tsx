import Svg, { Circle, G, Rect } from "react-native-svg";
import { Text, View } from "react-native";
import { useCSSVariable } from "uniwind";

const STRIPES = [0, 60, 120, 180, 240, 300];

/** A player's casino chip: striped edge, solid face, their initial. `chip` is 1 to 8. */
export function Chip({ chip, name, size = 32 }: { chip: number; name: string; size?: number }) {
  const [face, ink, edge, ring] = useCSSVariable([
    `--color-chip-${chip}`,
    `--color-chip-${chip}-ink`,
    "--color-chip-edge",
    "--color-line-strong",
  ]);
  const r = size / 2;
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
      className="items-center justify-center"
    >
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ position: "absolute" }}
      >
        <Circle
          cx={r}
          cy={r}
          r={r - 0.5}
          fill={String(face)}
          stroke={String(ring)}
          strokeWidth={1}
        />
        <G>
          {STRIPES.map((angle) => (
            <Rect
              key={angle}
              x={r - size * 0.07}
              y={0}
              width={size * 0.14}
              height={size * 0.18}
              fill={String(edge)}
              transform={`rotate(${angle} ${r} ${r})`}
            />
          ))}
        </G>
        <Circle
          cx={r}
          cy={r}
          r={size * 0.33}
          fill={String(face)}
          stroke="rgba(255,255,255,0.55)"
          strokeWidth={Math.max(1, size * 0.04)}
        />
      </Svg>
      <Text style={{ color: String(ink), fontSize: size * 0.34, fontWeight: "600" }}>
        {name.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}
