import { useId, type ReactNode } from "react";
import { Pressable, Text, TextInput, View, type TextInputProps } from "react-native";

import { cn } from "./cn";

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
      <Text nativeID={id} className="text-sm font-medium text-ink">
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        aria-labelledby={id}
        placeholderTextColorClassName="accent-muted"
        className={cn(
          "min-h-12 rounded-xl border bg-surface px-3 py-2.5 text-base text-ink",
          error ? "border-danger" : "border-line-strong focus:border-ink",
          inputClassName,
        )}
        {...props}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-danger">
          {error}
        </Text>
      ) : hint ? (
        <Text className="text-sm text-muted">{hint}</Text>
      ) : null}
    </View>
  );
}

/** A form-level failure, such as the API refusing the request. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <View accessibilityRole="alert" className="rounded-xl bg-sunken px-3 py-2.5">
      <Text className="text-sm text-danger">{children}</Text>
    </View>
  );
}

/** One of a few options, as a row or grid of chips. */
export function Choice<A extends string>({
  label,
  options,
  value,
  onChange,
  columns,
}: {
  label: string;
  options: ReadonlyArray<{ readonly value: A; readonly label: string }>;
  value: A;
  onChange: (value: A) => void;
  columns?: 2 | 3 | 4;
}) {
  return (
    <View className="gap-2" accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text className="text-sm font-medium text-ink">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(option.value)}
              className={cn(
                "min-h-11 items-center justify-center rounded-xl border px-4 py-2.5",
                columns === 2 && "basis-[48%] grow",
                columns === 3 && "basis-[31%] grow",
                columns === 4 && "basis-[23%] grow",
                selected
                  ? "border-accent bg-accent"
                  : "border-line-strong bg-surface active:bg-sunken",
              )}
            >
              <Text
                className={cn("text-center text-sm", selected ? "text-accent-ink" : "text-ink")}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
