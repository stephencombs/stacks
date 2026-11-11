import { Host } from "@expo/ui";
import { Button, DatePicker, Popover, VStack } from "@expo/ui/swift-ui";
import { accessibilityLabel, datePickerStyle, frame, padding } from "@expo/ui/swift-ui/modifiers";
import { useState } from "react";
import { Text, View } from "react-native";
import { useCSSVariable, useUniwind } from "uniwind";

import type { DateTimeFieldProps } from "./DateTimeField";
import { fieldDate, fieldDisplay, fieldText } from "./dateTimeValue";

export function DateTimeField({
  label,
  value,
  kind,
  onChange,
  error,
  maximumDate,
}: DateTimeFieldProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => fieldDate(value, kind) ?? new Date());
  const { theme } = useUniwind();
  const accent = useCSSVariable("--color-accent-text");
  return (
    <View className="gap-1.5">
      <Text className="px-1 type-footnote font-medium text-muted">{label}</Text>
      <Host
        style={{ height: 48 }}
        colorScheme={theme === "dark" ? "dark" : "light"}
        seedColor={typeof accent === "string" ? accent : undefined}
      >
        <Popover isPresented={open} onIsPresentedChange={setOpen}>
          <Popover.Trigger>
            <Button
              label={fieldDisplay(value, kind)}
              modifiers={[
                frame({ minHeight: 44 }),
                accessibilityLabel(`${label}, ${fieldDisplay(value, kind)}`),
              ]}
              onPress={() => {
                setDraft(fieldDate(value, kind) ?? new Date());
                setOpen(true);
              }}
            />
          </Popover.Trigger>
          <Popover.Content>
            <VStack modifiers={[padding({ all: 16 })]}>
              <DatePicker
                title={label}
                selection={draft}
                displayedComponents={[kind === "date" ? "date" : "hourAndMinute"]}
                range={maximumDate ? { end: maximumDate } : undefined}
                onDateChange={setDraft}
                modifiers={[datePickerStyle(kind === "date" ? "graphical" : "wheel")]}
              />
              <Button
                label="Done"
                modifiers={[frame({ minHeight: 44 })]}
                onPress={() => {
                  onChange(fieldText(draft, kind));
                  setOpen(false);
                }}
              />
            </VStack>
          </Popover.Content>
        </Popover>
      </Host>
      {error ? (
        <Text accessibilityRole="alert" className="px-1 type-footnote text-danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
