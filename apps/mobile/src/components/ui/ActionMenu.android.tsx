import { MenuView } from "./MenuView";
import { View } from "react-native";
import { Icon } from "./Icon";
import type { ActionMenuProps } from "./ActionMenu";

export function ActionMenu({
  label,
  actions,
  disabled = false,
  fab = false,
  vertical = false,
}: ActionMenuProps) {
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
        className={
          fab
            ? "size-14 items-center justify-center rounded-2xl bg-ink shadow-lg"
            : vertical
              ? "size-11 items-center justify-center"
              : "size-11 items-center justify-center rounded-full bg-fill"
        }
      >
        {fab ? (
          <Icon name="plus" color="ink-inverse" size={28} />
        ) : (
          <Icon name={vertical ? "more-vertical" : "more"} color="ink" size={20} />
        )}
      </View>
    </MenuView>
  );
}
