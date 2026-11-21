import Svg, { Circle, Rect } from "react-native-svg";
import { useCSSVariable } from "uniwind";

/** The Color Up mark: a chip rack from above, its columns the night's stacks, the tallest in yellow. */
export function BrandMark({ size, chip = false }: { size: number; chip?: boolean }) {
  const [ink, blue, red, teal, yellow, felt, feltInk] = useCSSVariable([
    "--color-ink",
    "--color-chip-2",
    "--color-chip-1",
    "--color-chip-3",
    "--color-chip-8",
    "--color-felt",
    "--color-felt-ink",
  ]).map(String);

  if (chip) {
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

  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityElementsHidden>
      <Rect x={8} y={10} width={48} height={44} rx={8} fill="none" stroke={ink} strokeWidth={5} />
      <Rect x={15} y={31} width={7} height={16} rx={3.5} fill={blue} />
      <Rect x={24.5} y={22} width={7} height={25} rx={3.5} fill={red} />
      <Rect x={34} y={27} width={7} height={20} rx={3.5} fill={teal} />
      <Rect x={43.5} y={17} width={7} height={30} rx={3.5} fill={yellow} />
    </Svg>
  );
}
