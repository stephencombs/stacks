import { SymbolView, type SFSymbol } from "expo-symbols";
import { useCSSVariable } from "uniwind";

import type { IconName } from "./Icon";

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
};

export function Icon({
  name,
  color,
  size = 20,
}: {
  name: IconName;
  color: "ink" | "muted" | "faint" | "accent-ink" | "accent-text" | "danger";
  size?: number;
}) {
  const tint = useCSSVariable(`--color-${color}`);
  return (
    <SymbolView
      name={symbols[name]}
      size={size}
      tintColor={String(tint)}
      weight="semibold"
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
