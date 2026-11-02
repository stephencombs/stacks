import { useId, type ReactNode } from "react";
import * as Haptics from "expo-haptics";
import { Platform, Pressable, Text, TextInput, View, type TextInputProps } from "react-native";

import { Icon } from "./Icon";
import { cn } from "./cn";

/** A caption over a group of rows, in the iOS grouped-list style. */
function FieldLabel({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <Text nativeID={id} className="px-1 type-footnote font-medium text-muted">
      {children}
    </Text>
  );
}

/**
 * A text field as iOS lays them out: a caption above a borderless field on a card, with any
 * error or hint underneath.
 */
export function TextField({
  label,
  hint,
  error,
  className,
  inputClassName,
  ...props
}: TextInputProps & {
  label: string;
  hint?: string;
  error?: string | null;
  className?: string;
  inputClassName?: string;
}) {
  const id = useId();
  return (
    <View className={cn("gap-1.5", className)}>
      <FieldLabel id={id}>{label}</FieldLabel>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        aria-labelledby={id}
        placeholderTextColorClassName="accent-muted"
        className={cn(
          "min-h-12 rounded-xl bg-surface px-4 py-3 type-body text-ink",
          error && "border border-danger",
          inputClassName,
        )}
        {...props}
      />
      {error ? (
        <View accessibilityLiveRegion="polite" className="flex-row gap-1.5 px-1">
          <Icon name="alert" color="danger" size={14} />
          <Text className="flex-1 type-footnote text-danger">{error}</Text>
        </View>
      ) : hint ? (
        <Text className="px-1 type-footnote text-muted">{hint}</Text>
      ) : null}
    </View>
  );
}

/** A form-level failure, such as the API refusing the request. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <View accessibilityRole="alert" className="flex-row gap-2 rounded-lg bg-sunken px-3 py-2.5">
      <Icon name="alert" color="danger" size={16} />
      <Text className="flex-1 text-sm text-danger">{children}</Text>
    </View>
  );
}

/**
 * One of a few options. Up to four read as an iOS segmented control; more read as a list of
 * rows with a checkmark, like a picker in Settings.
 */
export function Choice<A extends string>({
  label,
  options,
  value,
  onChange,
  labelHidden = false,
}: {
  label: string;
  options: ReadonlyArray<{ readonly value: A; readonly label: string }>;
  value: A;
  onChange: (value: A) => void;
  /** Read out but not shown, where the options speak for themselves. */
  labelHidden?: boolean;
}) {
  const pick = (next: A) => {
    if (next !== value && Platform.OS !== "web") void Haptics.selectionAsync();
    onChange(next);
  };
  if (options.length <= 4)
    return (
      <View className="gap-1.5" accessibilityRole="radiogroup" accessibilityLabel={label}>
        {labelHidden ? null : <FieldLabel>{label}</FieldLabel>}
        <View className="flex-row rounded-[10px] bg-fill p-0.5">
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ checked: selected }}
                onPress={() => pick(option.value)}
                className={cn(
                  "min-h-11 flex-1 items-center justify-center rounded-lg px-2",
                  selected && "bg-raised shadow-sm",
                )}
              >
                <Text
                  numberOfLines={1}
                  className={cn(
                    "type-footnote",
                    selected ? "font-semibold text-ink" : "font-medium text-ink",
                  )}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  return (
    <View className="gap-1.5" accessibilityRole="radiogroup" accessibilityLabel={label}>
      <FieldLabel>{label}</FieldLabel>
      <View className="overflow-hidden rounded-xl bg-surface">
        {options.map((option, index) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked: selected }}
              onPress={() => pick(option.value)}
              className="min-h-12 flex-row items-center pl-4 active:bg-sunken"
            >
              <View
                className={cn(
                  "min-h-12 flex-1 flex-row items-center justify-between pr-4",
                  index > 0 && "border-t border-line",
                )}
              >
                <Text className="type-body text-ink">{option.label}</Text>
                {selected ? <Icon name="check" color="accent-text" size={18} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
