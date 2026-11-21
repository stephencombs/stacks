import { Host } from "@expo/ui";
import { Button, Menu } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  disabled as disable,
  foregroundStyle,
  frame,
  labelStyle,
  tint,
} from "@expo/ui/swift-ui/modifiers";
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
  const resolvedInk = useCSSVariable(felt ? "--color-felt-ink" : "--color-ink");
  const ink = typeof resolvedInk === "string" ? resolvedInk : undefined;
  const glass = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  return (
    <Host
      matchContents
      colorScheme={felt ? "dark" : theme === "dark" ? "dark" : "light"}
      seedColor={ink}
    >
      <Menu
        label={label}
        systemImage={fab ? "plus" : "ellipsis"}
        modifiers={[
          buttonStyle(glass ? "glass" : "bordered"),
          buttonBorderShape("circle"),
          labelStyle("iconOnly"),
          ...(ink ? [foregroundStyle(ink), tint(ink)] : []),
          controlSize(fab ? "extraLarge" : "large"),
          frame(fab ? { minWidth: 56, minHeight: 56 } : { minWidth: 44, minHeight: 44 }),
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
            modifiers={[disable(action.disabled ?? false)]}
            onPress={action.onPress}
          />
        ))}
      </Menu>
    </Host>
  );
}
