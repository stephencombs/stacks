import { Host } from "@expo/ui";
import { Picker, Text } from "@expo/ui/swift-ui";
import { accessibilityLabel, frame, pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";
import * as Predicate from "effect/Predicate";
import { use } from "react";
import { View, useWindowDimensions } from "react-native";
import { Text as NativeText } from "./Text";
import { useCSSVariable, useUniwind } from "uniwind";

import { cn } from "./cn";
import type { FieldChoiceProps } from "./FieldChoice";
import { InSheet } from "./sheetContext";

export function FieldChoice<A extends string>({
  label,
  options,
  value,
  onChange,
  labelHidden = false,
  presentation = "automatic",
  inline = false,
}: FieldChoiceProps<A>) {
  const { width, fontScale } = useWindowDimensions();
  const { theme } = useUniwind();
  const inSheet = use(InSheet);
  const tint = useCSSVariable("--color-ink");
  const segmentWidth = (width - 64) / Math.max(1, options.length);

  const segmented =
    !inline &&
    presentation !== "menu" &&
    options.length <= 3 &&
    options.every((option) => option.label.length * 8 * fontScale + 32 <= segmentWidth);

  const colorScheme = theme === "dark" ? "dark" : "light";
  const seedColor = Predicate.isString(tint) ? tint : undefined;

  if (inline) {
    return (
      <Host matchContents colorScheme={colorScheme} seedColor={seedColor}>
        <Picker
          selection={value}
          onSelectionChange={onChange}
          modifiers={[pickerStyle("menu"), frame({ minHeight: 44 }), accessibilityLabel(label)]}
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

  const host = (
    <Host
      style={{ height: Math.max(48, 44 * fontScale) }}
      colorScheme={colorScheme}
      seedColor={seedColor}
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
  );

  return (
    <View className="gap-1.5">
      {labelHidden ? null : (
        <NativeText className="px-1 type-footnote font-medium text-muted">{label}</NativeText>
      )}
      {segmented ? (
        host
      ) : (
        <View
          className={cn(
            "overflow-hidden rounded-2xl border border-line px-3",
            inSheet ? "bg-raised" : "bg-surface",
          )}
        >
          {host}
        </View>
      )}
    </View>
  );
}
