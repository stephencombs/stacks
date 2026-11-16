import { MenuView } from "@expo/ui/community/menu";
import { View } from "react-native";
import { Icon } from "./Icon";
import type { ActionMenuProps } from "./ActionMenu";

export function ActionMenu({ label, actions, disabled = false, trigger }: ActionMenuProps) {
  return (
    <MenuView
      actions={actions.map((action, index) => ({
        id: String(index),
        title: action.label,
        attributes: { destructive: action.destructive, disabled: disabled || action.disabled },
      }))}
      onPressAction={({ nativeEvent }) => actions[Number(nativeEvent.event)]?.onPress()}
      shouldOpenOnLongPress={false}
    >
      <View
        accessible
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        className={trigger ? undefined : "size-11 items-center justify-center rounded-full bg-fill"}
      >
        {trigger ?? <Icon name="more" color="ink" size={20} />}
      </View>
    </MenuView>
  );
}
