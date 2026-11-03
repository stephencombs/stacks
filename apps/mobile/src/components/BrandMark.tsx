import Svg, { Rect } from "react-native-svg";
import { useCSSVariable } from "uniwind";

/** The Color Up mark: a chip rack from above, its columns the night's stacks, the tallest in gold. */
export function BrandMark({ size }: { size: number }) {
  const [ink, blue, red, teal, gold] = useCSSVariable([
    "--color-ink",
    "--color-chip-2",
    "--color-chip-1",
    "--color-chip-3",
    "--color-accent",
  ]).map(String);
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityElementsHidden>
      <Rect x={8} y={10} width={48} height={44} rx={8} fill="none" stroke={ink} strokeWidth={5} />
      <Rect x={15} y={31} width={7} height={16} rx={3.5} fill={blue} />
      <Rect x={24.5} y={22} width={7} height={25} rx={3.5} fill={red} />
      <Rect x={34} y={27} width={7} height={20} rx={3.5} fill={teal} />
      <Rect x={43.5} y={17} width={7} height={30} rx={3.5} fill={gold} />
    </Svg>
  );
}
