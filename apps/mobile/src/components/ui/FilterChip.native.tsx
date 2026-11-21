import type { ReactNode } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useUniwind } from "uniwind";

import { cn } from "./cn";
import { ChipFace, ChipShell, type FilterChipProps } from "./FilterChip.tsx";
import { Icon } from "./Icon";
import { MenuView } from "./MenuView";

/** A filter that opens the platform's own menu, with the picked choice checked. */
export function FilterChip<Value extends string>(props: FilterChipProps<Value>) {
  const { theme } = useUniwind();
  const label = props.options.find((option) => option.value === props.value)?.label ?? "";

  const menu = (face: ReactNode) => (
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
        {face}
      </View>
    </MenuView>
  );

  return Platform.OS === "android" ? (
    <AndroidFilterChip {...props} label={label}>
      {menu}
    </AndroidFilterChip>
  ) : (
    <ChipShell {...props}>{menu(<ChipFace label={label} applied={props.applied} />)}</ChipShell>
  );
}

export function AndroidFilterChip({
  name,
  label,
  applied,
  onClear,
  children,
}: Pick<FilterChipProps<string>, "name" | "applied" | "onClear"> & {
  label: string;
  children: (face: ReactNode) => ReactNode;
}) {
  return (
    <View className="min-h-11 flex-row items-center">
      <View
        className={cn(
          "min-h-8 flex-row items-center rounded-lg border",
          applied ? "border-ink bg-ink" : "border-fill-strong",
        )}
      >
        {children(
          <View
            className={cn(
              "min-h-[30px] max-w-44 flex-row items-center gap-1.5 pl-3",
              applied ? "pr-0.5" : "pr-2.5",
            )}
          >
            <Text
              className={cn(
                "shrink text-xs font-semibold",
                applied ? "text-ink-inverse" : "text-ink",
              )}
              numberOfLines={1}
            >
              {label}
            </Text>
            {applied ? null : <Icon name="chevron-down" color="muted" size={12} />}
          </View>,
        )}
        {applied ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear ${name.toLowerCase()} filter`}
            onPress={onClear}
            hitSlop={{ top: 6, bottom: 6, right: 6 }}
            className="min-h-[30px] w-6 items-center justify-center pr-1 active:opacity-70"
          >
            <Icon name="close" color="ink-inverse" size={14} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
