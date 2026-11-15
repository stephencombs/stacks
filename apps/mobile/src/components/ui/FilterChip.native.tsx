import { MenuView } from "@expo/ui/community/menu";
import { View } from "react-native";
import { useUniwind } from "uniwind";

import { ChipFace, ChipShell, type FilterChipProps } from "./FilterChip.tsx";

/** A filter as a pill that opens the platform's own menu, with the picked choice checked. */
export function FilterChip<Value extends string>(props: FilterChipProps<Value>) {
  const { theme } = useUniwind();
  const label = props.options.find((option) => option.value === props.value)?.label ?? "";
  return (
    <ChipShell {...props}>
      <MenuView
        colorScheme={theme === "dark" ? "dark" : "light"}
        title={props.name}
        actions={props.options.map((option, index) => ({
          id: String(index),
          title: option.label,
          state: option.value === props.value ? "on" : "off",
        }))}
        onPressAction={({ nativeEvent }) => {
          const option = props.options[Number(nativeEvent.event)];
          if (option) props.onChange(option.value);
        }}
        shouldOpenOnLongPress={false}
      >
        <View accessibilityRole="button" accessibilityLabel={`${props.name}: ${label}`}>
          <ChipFace label={label} applied={props.applied} />
        </View>
      </MenuView>
    </ChipShell>
  );
}
