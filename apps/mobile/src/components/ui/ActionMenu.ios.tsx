import { Host } from "@expo/ui";
import { Button, Image, Menu } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  disabled as disable,
  foregroundStyle,
  frame,
  menuIndicator,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import * as Predicate from "effect/Predicate";
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { useCSSVariable, useUniwind } from "uniwind";

import type { ActionMenuProps } from "./ActionMenu";
import { symbols } from "./Icon.ios";

export function ActionMenu({
  label,
  actions,
  disabled = false,
  fab = false,
  felt = false,
}: ActionMenuProps) {
  const { theme } = useUniwind();
  const [resolvedInk, resolvedFeltInk] = useCSSVariable(["--color-ink", "--color-felt-ink"]);
  const menuInk = Predicate.isString(resolvedInk) ? resolvedInk : undefined;
  const triggerInk = felt && Predicate.isString(resolvedFeltInk) ? resolvedFeltInk : menuInk;
  const glass = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

  return (
    <Host
      matchContents
      colorScheme={felt ? "dark" : theme === "dark" ? "dark" : "light"}
      seedColor={menuInk}
    >
      <Menu
        label={
          <Image
            systemName={fab ? "plus" : "ellipsis"}
            size={fab ? 22 : 18}
            modifiers={[frame({ width: 24, height: 24 })]}
          />
        }
        modifiers={[
          buttonStyle(glass ? "glass" : "bordered"),
          buttonBorderShape("circle"),
          menuIndicator("hidden"),
          ...(triggerInk
            ? felt
              ? [foregroundStyle(triggerInk)]
              : [foregroundStyle(triggerInk), tint(triggerInk)]
            : []),
          controlSize(fab ? "extraLarge" : "regular"),
          frame(
            fab
              ? { minWidth: 56, minHeight: 56 }
              : { minWidth: 44, maxWidth: 44, minHeight: 44, maxHeight: 44 },
          ),
          accessibilityLabel(label),
          disable(disabled),
        ]}
      >
        {actions.map((action) => (
          <Button
            key={action.label}
            label={action.label}
            systemImage={action.icon ? symbols[action.icon] : undefined}
            role={action.destructive ? "destructive" : "default"}
            modifiers={[
              disable(action.disabled ?? false),
              ...(!action.destructive && menuInk ? [foregroundStyle(menuInk), tint(menuInk)] : []),
            ]}
            onPress={action.onPress}
          />
        ))}
      </Menu>
    </Host>
  );
}
