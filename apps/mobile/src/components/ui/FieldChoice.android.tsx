import { Host, Picker } from "@expo/ui";
import { SegmentedButton, SingleChoiceSegmentedButtonRow, Text } from "@expo/ui/jetpack-compose";
import { defaultMinSize, fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
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
    options.every((option) => option.label.length * 8 * fontScale + 48 <= segmentWidth);
  return (
    <View className="gap-1.5">
      {labelHidden ? null : (
        <NativeText className="px-1 type-footnote font-medium text-muted">{label}</NativeText>
      )}
      <Host
        matchContents={{ vertical: true }}
        colorScheme={theme === "dark" ? "dark" : "light"}
        seedColor={typeof accent === "string" ? accent : undefined}
      >
        {segmented ? (
          <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
            {options.map((option) => (
              <SegmentedButton
                key={option.value}
                selected={option.value === value}
                onClick={() => onChange(option.value)}
                modifiers={[defaultMinSize({ minHeight: 48 })]}
              >
                <SegmentedButton.Label>
                  <Text>{option.label}</Text>
                </SegmentedButton.Label>
              </SegmentedButton>
            ))}
          </SingleChoiceSegmentedButtonRow>
        ) : (
          <Picker selectedValue={value} onValueChange={onChange}>
            {options.map((option) => (
              <Picker.Item key={option.value} label={option.label} value={option.value} />
            ))}
          </Picker>
        )}
      </Host>
    </View>
  );
}
