import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { cn } from "./cn";
import { Choice } from "./Field";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

export type FilterChipProps<Value extends string> = {
  /** What it filters, read out before the choice: "Period". */
  name: string;
  options: ReadonlyArray<{ readonly value: Value; readonly label: string }>;
  value: Value;
  applied: boolean;
  onChange: (value: Value) => void;
  onClear: () => void;
};

/** The pill's face: the picked choice, and a caret until it's applied. */
export function ChipFace({ label, applied }: { label: string; applied: boolean }) {
  return (
    <View className={cn("h-11 flex-row items-center gap-1.5", applied ? "pr-1 pl-4" : "px-4")}>
      <Text
        numberOfLines={1}
        className={cn("type-callout font-medium", applied ? "text-ink-inverse" : "text-ink")}
      >
        {label}
      </Text>
      {applied ? null : <Icon name="chevron-down" color="muted" size={14} />}
    </View>
  );
}

/**
 * A filter as a pill that opens its choices; native menus on iOS and Android
 * (`FilterChip.native.tsx`), a sheet here. Once applied, the pill fills and gains a clear button.
 */
export function FilterChip<Value extends string>(props: FilterChipProps<Value>) {
  const [open, setOpen] = useState(false);
  const label = props.options.find((option) => option.value === props.value)?.label ?? "";
  return (
    <ChipShell {...props}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${props.name}: ${label}`}
        onPress={() => setOpen(true)}
        className="active:opacity-70"
      >
        <ChipFace label={label} applied={props.applied} />
      </Pressable>
      {open ? (
        <Sheet open title={props.name} onClose={() => setOpen(false)}>
          <Choice
            label={props.name}
            labelHidden
            options={props.options}
            value={props.value}
            onChange={(value) => {
              setOpen(false);
              props.onChange(value);
            }}
          />
        </Sheet>
      ) : null}
    </ChipShell>
  );
}

/** The pill around a chip's trigger, with the clear button once it's applied. */
export function ChipShell({
  name,
  applied,
  onClear,
  children,
}: Pick<FilterChipProps<string>, "name" | "applied" | "onClear"> & { children: ReactNode }) {
  return (
    <View className={cn("h-11 flex-row items-center rounded-full", applied ? "bg-ink" : "bg-fill")}>
      {children}
      {applied ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Clear ${name.toLowerCase()} filter`}
          onPress={onClear}
          className="size-11 items-center justify-center active:opacity-70"
        >
          <View className="size-5 items-center justify-center rounded-full bg-ink-inverse/20">
            <Icon name="close" color="ink-inverse" size={11} />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}
