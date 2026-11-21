import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { ActivityIndicator, Platform, Text } from "react-native";

import { cn } from "./cn";
import { ControlSurface } from "./ControlSurface";
import { PressableScale } from "./PressableScale";

type Variant =
  | "primary"
  | "tint"
  | "secondary"
  | "ghost"
  | "link"
  | "danger"
  | "felt"
  | "feltPrimary";

type Size = "sm" | "md" | "lg" | "xl" | "fab";

const surfaces: Record<Variant, string> = {
  primary: "bg-ink active:opacity-85",
  tint: "bg-fill-strong active:opacity-70",
  secondary: "bg-fill active:opacity-70",
  ghost: "active:bg-fill",
  link: "active:bg-fill",
  danger: "bg-fill active:opacity-70",
  felt: "bg-white/15 active:bg-white/25",
  feltPrimary: "bg-felt-ink active:opacity-90",
};

const spinners: Record<Variant, string> = {
  primary: "accent-ink-inverse",
  tint: "accent-ink",
  secondary: "accent-ink",
  ghost: "accent-ink",
  link: "accent-chip-blue",
  danger: "accent-loss",
  felt: "accent-felt-ink",
  feltPrimary: "accent-felt-deep",
};

const labels: Record<Variant, string> = {
  primary: "text-ink-inverse",
  tint: "text-ink",
  secondary: "text-ink",
  ghost: "text-ink",
  link: "text-chip-blue",
  danger: "text-loss",
  felt: "text-felt-ink",
  feltPrimary: "text-[#14472B]",
};

const sizes: Record<Size, string> = {
  sm: "min-h-11 px-4 py-2 rounded-full",
  md: "min-h-11 px-5 py-2.5 rounded-full",
  lg: "min-h-13 px-6 py-3 rounded-full",
  xl: "min-h-14 px-6 py-4 rounded-full",
  fab: "min-h-14 rounded-2xl px-4 py-3",
};

const text: Record<Size, string> = {
  sm: "type-callout",
  md: "type-callout",
  lg: "type-body",
  xl: "type-body",
  fab: "type-callout",
};

export function Button({
  label,
  onPress,
  variant = "secondary",
  size = "md",
  disabled = false,
  pending = false,
  icon,
  haptic = false,
  accessibilityLabel,
  testID,
  className,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  /** Shows a spinner and blocks presses while a request is in flight. */
  pending?: boolean;
  icon?: ReactNode;
  /** A light tap on press, for actions repeated at the table. */
  haptic?: boolean;
  accessibilityLabel?: string;
  /** For the simulator E2E flows in apps/mobile/maestro, where a label alone is ambiguous. */
  testID?: string;
  className?: string;
}) {
  const inactive = disabled || pending;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      accessibilityState={{ disabled: inactive, busy: pending }}
      disabled={inactive}
      onPress={() => {
        if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className={cn(
        "flex-row items-center justify-center gap-2",
        surfaces[variant],
        sizes[size],
        disabled &&
          !pending &&
          (variant === "ghost" || variant === "link" ? "bg-transparent" : "bg-fill"),
        className,
      )}
    >
      {pending ? <ActivityIndicator size="small" colorClassName={spinners[variant]} /> : icon}
      <Text
        className={cn(
          "font-semibold",
          Platform.OS === "android" && "shrink text-center",
          disabled && !pending ? "text-muted" : labels[variant],
          text[size],
        )}
        numberOfLines={Platform.OS === "android" ? 2 : 1}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

export function IconButton({
  icon,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  disabled = false,
  haptic = false,
  className,
  plain = false,
  felt = false,
}: {
  icon: ReactNode;
  accessibilityLabel: string;
  accessibilityHint?: string;
  onPress: () => void;
  disabled?: boolean;
  haptic?: boolean;
  className?: string;
  plain?: boolean;
  felt?: boolean;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={() => {
        if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className={cn(
        "size-11",
        plain && "items-center justify-center rounded-full active:bg-fill",
        !plain && felt && "items-center justify-center rounded-full bg-black/15 active:bg-black/25",
        disabled && "opacity-50",
        className,
      )}
    >
      {plain || felt ? icon : <ControlSurface>{icon}</ControlSurface>}
    </PressableScale>
  );
}
