import { Host } from "@expo/ui";
import { Button, DatePicker, Popover, VStack } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  datePickerStyle,
  foregroundStyle,
  frame,
  labelsHidden,
  padding,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import * as Predicate from "effect/Predicate";
import { use, useState } from "react";
import { Text, View } from "react-native";
import { useCSSVariable, useUniwind } from "uniwind";

import { cn } from "./cn";
import type { DateTimeFieldProps } from "./DateTimeField";
import { fieldDate, fieldDisplay, fieldText } from "./dateTimeValue";
import { InSheet } from "./sheetContext";

export function DateTimeField({
  label,
  value,
  kind,
  onChange,
  error,
  maximumDate,
  compact = false,
}: DateTimeFieldProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => fieldDate(value, kind) ?? new Date());
  const { theme } = useUniwind();
  const inSheet = use(InSheet);
  const resolvedInk = useCSSVariable("--color-ink");
  const ink = Predicate.isString(resolvedInk) ? resolvedInk : undefined;

  const triggerModifiers = compact
    ? [
        buttonStyle("bordered"),
        buttonBorderShape("roundedRectangle", 10),
        controlSize("small"),
        ...(ink ? [foregroundStyle(ink), tint(ink)] : []),
        accessibilityLabel(`${label}, ${fieldDisplay(value, kind)}`),
      ]
    : [
        buttonStyle("plain"),
        frame({ minHeight: 44 }),
        ...(ink ? [foregroundStyle(ink), tint(ink)] : []),
        accessibilityLabel(`${label}, ${fieldDisplay(value, kind)}`),
      ];

  const host = (
    <Host
      {...(compact ? { matchContents: true } : { style: { height: 48 } })}
      colorScheme={theme === "dark" ? "dark" : "light"}
      seedColor={ink}
    >
      <Popover isPresented={open} onIsPresentedChange={setOpen}>
        <Popover.Trigger>
          <Button
            label={fieldDisplay(value, kind)}
            modifiers={triggerModifiers}
            onPress={() => {
              setDraft(fieldDate(value, kind) ?? new Date());
              setOpen(true);
            }}
          />
        </Popover.Trigger>
        <Popover.Content>
          <VStack modifiers={[padding({ all: 12 })]}>
            <DatePicker
              title={label}
              selection={draft}
              displayedComponents={[kind === "date" ? "date" : "hourAndMinute"]}
              range={maximumDate ? { end: maximumDate } : undefined}
              onDateChange={setDraft}
              modifiers={[datePickerStyle(kind === "date" ? "graphical" : "wheel"), labelsHidden()]}
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
  );

  return (
    <View className="gap-1.5">
      {compact ? null : <Text className="px-1 type-footnote font-medium text-muted">{label}</Text>}
      {compact ? (
        host
      ) : (
        <View
          className={cn(
            "overflow-hidden rounded-2xl border border-line px-3",
            inSheet ? "bg-raised" : "bg-surface",
            error && "border-loss",
          )}
        >
          {host}
        </View>
      )}
      {error ? (
        <Text accessibilityRole="alert" className="px-1 type-footnote text-loss">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
