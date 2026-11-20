import { View, type ImageSourcePropType } from "react-native";
import { Icon, type IconName } from "./Icon";
import { MenuView } from "./MenuView";
import type { ActionMenuProps } from "./ActionMenu";

const menuIcons: Partial<Record<IconName, ImageSourcePropType>> = {
  edit: require("../../../assets/menu-icons/edit.xml"),
  "add-person": require("../../../assets/menu-icons/person_add.xml"),
  share: require("../../../assets/menu-icons/share.xml"),
  settings: require("../../../assets/menu-icons/settings.xml"),
  trash: require("../../../assets/menu-icons/delete.xml"),
};

export function ActionMenu({
  label,
  actions,
  disabled = false,
  fab = false,
  vertical = false,
  felt = false,
}: ActionMenuProps) {
  return (
    <MenuView
      actions={actions.map((action, index) => ({
        id: String(index),
        title: action.label,
        ...(action.icon && menuIcons[action.icon] ? { image: menuIcons[action.icon] } : {}),
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
            : felt
              ? "size-11 items-center justify-center rounded-full bg-black/15"
              : vertical
                ? "size-11 items-center justify-center"
                : "size-11 items-center justify-center rounded-full bg-fill"
        }
      >
        {fab ? (
          <Icon name="plus" color="ink-inverse" size={28} />
        ) : (
          <Icon
            name={vertical ? "more-vertical" : "more"}
            color={felt ? "felt-ink" : "ink"}
            size={20}
          />
        )}
      </View>
    </MenuView>
  );
}
