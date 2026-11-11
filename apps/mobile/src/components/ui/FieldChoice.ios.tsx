import { Host } from "@expo/ui";
import { Picker, Text } from "@expo/ui/swift-ui";
import { accessibilityLabel, frame, pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";
import { Text as NativeText, View, useWindowDimensions } from "react-native";
import { useCSSVariable, useUniwind } from "uniwind";

import type { FieldChoiceProps } from "./FieldChoice";

export function FieldChoice<A extends string>({
  label,
  options,
  value,
  onChange,
  labelHidden = false,
  presentation = "automatic",
}: FieldChoiceProps<A>) {
  const { width, fontScale } = useWindowDimensions();
  const { theme } = useUniwind();
  const accent = useCSSVariable("--color-accent-text");
  const segmentWidth = (width - 64) / Math.max(1, options.length);
  const segmented =
    presentation !== "menu" &&
    options.length <= 3 &&
    options.every((option) => option.label.length * 8 * fontScale + 32 <= segmentWidth);
  return (
    <View className="gap-1.5">
      {labelHidden ? null : (
        <NativeText className="px-1 type-footnote font-medium text-muted">{label}</NativeText>
      )}
      <Host
        style={{ height: Math.max(48, 44 * fontScale) }}
        colorScheme={theme === "dark" ? "dark" : "light"}
        seedColor={typeof accent === "string" ? accent : undefined}
      >
        <Picker
          selection={value}
          onSelectionChange={onChange}
          modifiers={[
            pickerStyle(segmented ? "segmented" : "menu"),
            frame({ minHeight: 44 }),
            accessibilityLabel(label),
          ]}
        >
          {options.map((option) => (
            <Text key={option.value} modifiers={[tag(option.value)]}>
              {option.label}
            </Text>
          ))}
        </Picker>
      </Host>
    </View>
  );
}
