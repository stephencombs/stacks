import { useState } from "react";
import Svg, { Circle, G, Rect } from "react-native-svg";
import { Image, View } from "react-native";
import { Text } from "../components/ui/Text";
import { useCSSVariable } from "uniwind";

const STRIPES = [0, 60, 120, 180, 240, 300];

export type ChipProps = {
  chip: number;
  name: string;
  size?: number;
  ring?: boolean;
};

/**
 * A player's casino chip: striped edge, solid face, their initial. `chip` is 1 to 8. A
 * `photoUri` swaps the face for the photo inside a ring in the chip's color, and a photo that
 * won't load goes back to the initial. Only `PlayerChip` looks a photo up; a venue's chip never has one.
 */
export function Chip({ photoUri, ...props }: ChipProps & { photoUri?: string | null | undefined }) {
  return photoUri ? (
    <PhotoChip key={photoUri} photoUri={photoUri} {...props} />
  ) : (
    <InitialChip {...props} />
  );
}

function PhotoChip({ photoUri, ...props }: ChipProps & { photoUri: string }) {
  const [failed, setFailed] = useState(false);
  const face = useCSSVariable(`--color-chip-${props.chip}`);
  const size = props.size ?? 32;
  const border = size < 26 ? 1.5 : 2;

  if (failed) return <InitialChip {...props} />;

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: border,
        borderColor: String(face),
      }}
      className="overflow-hidden bg-fill"
    >
      <Image
        source={{ uri: photoUri }}
        style={{ width: size - border * 2, height: size - border * 2 }}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    </View>
  );
}

function InitialChip({ chip, name, size = 32, ring = false }: ChipProps) {
  const [face, ink, edge, border] = useCSSVariable([
    `--color-chip-${chip}`,
    `--color-chip-${chip}-ink`,
    "--color-chip-edge",
    "--color-fill-strong",
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
          stroke={String(border)}
          strokeWidth={1}
          opacity={ring ? 0.6 : 1}
        />
        {ring ? null : (
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
        )}
        <Circle
          cx={r}
          cy={r}
          r={size * (ring ? 0.4 : 0.33)}
          fill={String(face)}
          stroke={ring ? undefined : "rgba(255,255,255,0.55)"}
          strokeWidth={Math.max(1, size * 0.04)}
        />
      </Svg>
      <Text style={{ color: String(ink), fontSize: size * 0.34, fontWeight: "600" }}>
        {(ring
          ? name
              .trim()
              .split(/\s+/, 2)
              .map((part) => part[0])
              .join("")
          : name.slice(0, 1)
        ).toUpperCase()}
      </Text>
    </View>
  );
}
