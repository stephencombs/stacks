import { SymbolView, type SFSymbol } from "expo-symbols";
import { useCSSVariable } from "uniwind";

import type { IconColor, IconName } from "./Icon";

const symbols: Record<IconName, SFSymbol> = {
  alert: "exclamationmark.circle",
  "chevron-right": "chevron.right",
  "chevron-down": "chevron.down",
  more: "ellipsis",
  check: "checkmark",
  "arrow-right": "arrow.right",
  close: "xmark",
  delete: "delete.left",
  "cloud-check": "checkmark.icloud",
  "cloud-upload": "icloud.and.arrow.up",
  "cloud-off": "icloud.slash",
  sessions: "suit.club",
  board: "chart.line.uptrend.xyaxis",
  group: "person.2",
  stats: "chart.bar",
  map: "map",
  plus: "plus",
  search: "magnifyingglass",
  filter: "line.3.horizontal.decrease",
  settings: "gearshape",
  download: "square.and.arrow.up",
  sparkles: "sparkles",
};

const filledSymbols: Partial<Record<IconName, SFSymbol>> = {
  sessions: "suit.club.fill",
  group: "person.2.fill",
  stats: "chart.bar.fill",
  map: "map.fill",
  settings: "gearshape.fill",
};

export function Icon({
  name,
  color,
  size = 20,
  filled = false,
}: {
  name: IconName;
  color: IconColor;
  size?: number;
  filled?: boolean;
}) {
  const tint = useCSSVariable(`--color-${color}`);
  return (
    <SymbolView
      name={(filled ? filledSymbols[name] : undefined) ?? symbols[name]}
      size={size}
      tintColor={String(tint)}
      weight={filled ? "bold" : "semibold"}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
