import Svg, { Circle, Rect } from "react-native-svg";
import { useCSSVariable } from "uniwind";

export function BrandMark({ size }: { size: number }) {
  const [felt, feltInk] = useCSSVariable(["--color-felt", "--color-felt-ink"]).map(String);

  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityElementsHidden>
      <Rect width={64} height={64} rx={17} fill={felt} />
      <Circle cx={32} cy={32} r={6} fill={feltInk} />
      <Circle
        cx={32}
        cy={32}
        r={16}
        fill="none"
        stroke={feltInk}
        strokeWidth={6}
        strokeDasharray={[17.1, 8.03]}
        rotation={-14}
        origin="32, 32"
      />
    </Svg>
  );
}
