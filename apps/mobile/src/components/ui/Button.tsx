import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, Text } from "react-native";

import { cn } from "./cn";

type Variant = "primary" | "tint" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "xl";

const surfaces: Record<Variant, string> = {
  primary: "bg-accent active:opacity-85",
  tint: "bg-accent/15 active:bg-accent/25",
  secondary: "bg-fill active:opacity-70",
  ghost: "active:bg-fill",
  danger: "bg-fill active:opacity-70",
};
const spinners: Record<Variant, string> = {
  primary: "accent-accent-ink",
  tint: "accent-accent-text",
  secondary: "accent-ink",
  ghost: "accent-ink",
  danger: "accent-danger",
};
const labels: Record<Variant, string> = {
  primary: "text-accent-ink",
  tint: "text-accent-text",
  secondary: "text-ink",
  ghost: "text-ink",
  danger: "text-danger",
};
// Minimum heights, so larger accessibility text sizes grow the button instead of clipping it.
const sizes: Record<Size, string> = {
  sm: "min-h-11 px-4 py-2 rounded-full",
  md: "min-h-11 px-5 py-2.5 rounded-full",
  lg: "min-h-13 px-6 py-3 rounded-full",
  xl: "min-h-14 px-6 py-4 rounded-full",
};
const text: Record<Size, string> = {
  sm: "type-callout",
  md: "type-callout",
  lg: "type-body",
  xl: "type-body",
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
  className?: string;
}) {
  const inactive = disabled || pending;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: pending }}
      disabled={inactive}
      onPress={() => {
        if (haptic && Platform.OS !== "web")
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className={cn(
        "flex-row items-center justify-center gap-2",
        surfaces[variant],
        sizes[size],
        disabled && !pending && (variant === "ghost" ? "bg-transparent" : "bg-disabled"),
        className,
      )}
    >
      {pending ? <ActivityIndicator size="small" colorClassName={spinners[variant]} /> : icon}
      <Text
        className={cn(
          "font-semibold",
          disabled && !pending ? "text-muted" : labels[variant],
          text[size],
        )}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}
