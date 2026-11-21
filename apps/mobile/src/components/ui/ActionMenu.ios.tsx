import { Host } from "@expo/ui";
import { Button, Menu } from "@expo/ui/swift-ui";
import * as swiftModifiers from "@expo/ui/swift-ui/modifiers";
import {
  accessibilityLabel,
  buttonStyle,
  controlSize,
  disabled as disable,
  frame,
  labelStyle,
} from "@expo/ui/swift-ui/modifiers";
import type { ActionMenuProps } from "./ActionMenu";
import { symbols } from "./Icon.ios";

export function ActionMenu({ label, actions, disabled = false, fab = false }: ActionMenuProps) {
  return (
    <Host matchContents>
      <Menu
        label={label}
        systemImage={fab ? "plus" : "ellipsis"}
        modifiers={[
          buttonStyle("bordered"),
          labelStyle("iconOnly"),
          ...(fab ? [swiftModifiers.buttonBorderShape("circle"), controlSize("extraLarge")] : []),
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
