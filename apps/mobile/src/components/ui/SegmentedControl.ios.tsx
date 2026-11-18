import { Host } from "@expo/ui";
import { Picker, Text } from "@expo/ui/swift-ui";
import { accessibilityLabel, frame, pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";
import { useWindowDimensions } from "react-native";
import { useCSSVariable, useUniwind } from "uniwind";

import type { SegmentedControlProps } from "./SegmentedControl";

/** iOS's own segmented control, for options that are one scope of the same data. */
export function SegmentedControl<A extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<A>) {
  const { fontScale } = useWindowDimensions();
  const { theme } = useUniwind();
  const tint = useCSSVariable("--color-ink");
  return (
    <Host
      style={{ height: Math.max(48, 44 * fontScale) }}
      colorScheme={theme === "dark" ? "dark" : "light"}
      seedColor={typeof tint === "string" ? tint : undefined}
    >
      <Picker
        selection={value}
        onSelectionChange={onChange}
        modifiers={[pickerStyle("segmented"), frame({ minHeight: 44 }), accessibilityLabel(label)]}
      >
        {options.map((option) => (
          <Text key={option.value} modifiers={[tag(option.value)]}>
            {option.label}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}
