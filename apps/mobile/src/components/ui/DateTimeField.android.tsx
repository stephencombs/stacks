import { DatePickerDialog, TimePickerDialog } from "@expo/ui/jetpack-compose";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ComposeHost as Host } from "./ComposeHost.android";
import type { DateTimeFieldProps } from "./DateTimeField";
import { fieldDisplay, pickerStart, pickerText } from "./dateTimeValue";

export function DateTimeField({
  label,
  value,
  kind,
  onChange,
  error,
  maximumDate,
}: DateTimeFieldProps) {
  const [open, setOpen] = useState(false);
  const pick = (picked: Date) => {
    onChange(pickerText(picked, kind));
    setOpen(false);
  };
  return (
    <View className="gap-1.5">
      <Text className="px-1 type-footnote font-medium text-muted">{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${fieldDisplay(value, kind)}`}
        onPress={() => setOpen(true)}
        className="min-h-12 justify-center rounded-2xl bg-surface px-4 py-3"
      >
        <Text className="type-body text-ink">{fieldDisplay(value, kind)}</Text>
      </Pressable>
      {open ? (
        <Host style={{ position: "absolute", width: 0, height: 0 }}>
          {kind === "date" ? (
            <DatePickerDialog
              initialDate={pickerStart(value, kind)}
              {...(maximumDate ? { selectableDates: { end: maximumDate } } : {})}
              onDateSelected={pick}
              onDismissRequest={() => setOpen(false)}
            />
          ) : (
            <TimePickerDialog
              initialDate={pickerStart(value, kind)}
              onDateSelected={pick}
              onDismissRequest={() => setOpen(false)}
            />
          )}
        </Host>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" className="px-1 type-footnote text-loss">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
