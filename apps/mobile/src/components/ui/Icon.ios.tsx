import { SymbolView, type SFSymbol } from "expo-symbols";
import { useCSSVariable } from "uniwind";

import type { IconColor, IconName } from "./Icon";

export const symbols: Record<IconName, SFSymbol> = {
  alert: "exclamationmark.circle",
  "chevron-right": "chevron.right",
  "chevron-down": "chevron.down",
  more: "ellipsis",
  "more-vertical": "ellipsis",
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
  trip: "airplane",
  link: "link",
  plus: "plus",
  edit: "pencil",
  search: "magnifyingglass",
  filter: "line.3.horizontal.decrease",
  settings: "gearshape",
  download: "square.and.arrow.up",
  "eye-off": "eye.slash",
  sparkles: "sparkles",
  "add-person": "person.badge.plus",
  person: "person.crop.circle",
  share: "square.and.arrow.up",
  trash: "trash",
  calendar: "calendar",
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
