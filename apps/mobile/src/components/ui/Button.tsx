import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, Text } from "react-native";

import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "xl";

const surfaces: Record<Variant, string> = {
  primary: "bg-accent active:opacity-85",
  secondary: "bg-surface border border-line-strong active:bg-sunken",
  ghost: "active:bg-sunken",
  danger: "bg-surface border border-line-strong active:bg-sunken",
};
const labels: Record<Variant, string> = {
  primary: "text-accent-ink",
  secondary: "text-ink",
  ghost: "text-ink",
  danger: "text-danger",
};
// Minimum heights, so larger accessibility text sizes grow the button instead of clipping it.
const sizes: Record<Size, string> = {
  sm: "min-h-11 px-3 py-2 rounded-lg",
  md: "min-h-11 px-4 py-2.5 rounded-xl",
  lg: "min-h-13 px-5 py-3 rounded-xl",
  xl: "min-h-16 px-5 py-4 rounded-2xl",
};
const text: Record<Size, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-base",
  xl: "text-lg",
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
        inactive && "opacity-50",
        className,
      )}
    >
      {pending ? <ActivityIndicator size="small" /> : icon}
      <Text className={cn("font-medium", labels[variant], text[size])} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
