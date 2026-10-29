import { ArrowRight, Check, ChevronRight } from "lucide-react-native";
import { useCSSVariable } from "uniwind";

const icons = { "chevron-right": ChevronRight, check: Check, "arrow-right": ArrowRight };

export type IconName = keyof typeof icons;

/** A decorative icon in a palette color; lucide here, SF Symbols on iOS (`Icon.ios.tsx`). */
export function Icon({
  name,
  color,
  size = 20,
}: {
  name: IconName;
  color: "ink" | "muted" | "faint" | "accent-ink" | "accent-text";
  size?: number;
}) {
  const Glyph = icons[name];
  const tint = useCSSVariable(`--color-${color}`);
  return (
    <Glyph
      size={size}
      color={String(tint)}
      strokeWidth={2}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
