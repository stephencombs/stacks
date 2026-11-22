import { use, useId, type ReactNode } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { Text } from "./Text";

import { Icon } from "./Icon";
import { cn } from "./cn";
import { FieldChoice } from "./FieldChoice";
import { InSheet } from "./sheetContext";

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
  const inSheet = use(InSheet);

  return (
    <View className={cn("gap-1.5", className)}>
      <FieldLabel id={id}>{label}</FieldLabel>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        aria-labelledby={id}
        placeholderTextColorClassName="accent-muted"
        className={cn(
          "min-h-12 rounded-2xl border border-line px-4 py-3 font-sans type-body text-ink",
          inSheet ? "bg-raised" : "bg-surface",
          error && "border-loss",
          inputClassName,
        )}
        {...props}
      />
      {error ? (
        <View accessibilityLiveRegion="polite" className="flex-row gap-1.5 px-1">
          <Icon name="alert" color="loss" size={14} />
          <Text className="flex-1 type-footnote text-loss">{error}</Text>
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
    <View accessibilityRole="alert" className="flex-row gap-2 rounded-lg bg-fill px-3 py-2.5">
      <Icon name="alert" color="loss" size={16} />
      <Text className="flex-1 text-sm text-loss">{children}</Text>
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
  presentation = "automatic",
  inline = false,
}: {
  label: string;
  options: ReadonlyArray<{ readonly value: A; readonly label: string }>;
  value: A;
  onChange: (value: A) => void;
  /** Read out but not shown, where the options speak for themselves. */
  labelHidden?: boolean;
  presentation?: "automatic" | "menu";
  inline?: boolean;
}) {
  return (
    <FieldChoice {...{ label, options, value, onChange, labelHidden, presentation, inline }} />
  );
}
