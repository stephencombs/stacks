import DateTimePicker from "@expo/ui/community/datetime-picker";
import { getCalendars } from "expo-localization";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useUniwind } from "uniwind";

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
  const uses24Hour = getCalendars()[0]?.uses24hourClock ?? undefined;
  const shown = fieldDisplay(value, kind, uses24Hour);
  return (
    <View className="gap-1.5">
      <Text className="px-1 type-footnote font-medium text-muted">{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${shown}`}
        onPress={() => {
          setDraft(fieldDate(value, kind) ?? new Date());
          setOpen(true);
        }}
        className="min-h-12 justify-center rounded-2xl bg-surface px-4 py-3"
      >
        <Text className="type-body text-ink">{shown}</Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={draft}
          mode={kind}
          maximumDate={maximumDate}
          is24Hour={uses24Hour}
          themeVariant={theme === "dark" ? "dark" : "light"}
          onDismiss={() => setOpen(false)}
          onValueChange={(_event, date) => {
            onChange(fieldText(date, kind));
            setOpen(false);
          }}
        />
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" className="px-1 type-footnote text-loss">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
