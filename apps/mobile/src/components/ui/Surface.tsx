import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { cn } from "./cn";

export function Surface({ children, className }: { children: ReactNode; className?: string }) {
  return <View className={cn("overflow-hidden rounded-xl bg-surface", className)}>{children}</View>;
}

/** A surface of rows. The list clips the first row's divider, so only gaps between rows show one. */
export function List({ children }: { children: ReactNode }) {
  return (
    <Surface>
      <View className="-mt-px">{children}</View>
    </Surface>
  );
}

/**
 * One row of a List. A pressable row is read out from its content, so the hint says what pressing
 * it does rather than replacing what it shows.
 */
export function Row({
  children,
  onPress,
  accessibilityHint,
  className,
}: {
  children: ReactNode;
  onPress?: () => void;
  accessibilityHint?: string;
  className?: string;
}) {
  const classes = cn("flex-row items-center gap-3 border-t border-line px-4 py-3.5", className);
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      className={cn(classes, "active:bg-sunken")}
    >
      {children}
    </Pressable>
  ) : (
    <View className={classes}>{children}</View>
  );
}

/** The one title on a screen, with an optional line under it saying where the screen sits. */
export function PageTitle({ context, children }: { context?: string; children: string }) {
  return (
    <View className="gap-1">
      <Text accessibilityRole="header" className="type-title text-ink">
        {children}
      </Text>
      {context ? <Text className="text-sm text-muted">{context}</Text> : null}
    </View>
  );
}

export function SectionHeading({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <View className="min-h-9 flex-row items-center justify-between">
      <Text accessibilityRole="header" className="text-lg font-semibold text-ink">
        {children}
      </Text>
      {action}
    </View>
  );
}

export function Tag({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "live";
  children: string;
}) {
  return (
    <View
      className={cn(
        "h-6 flex-row items-center gap-1.5 self-start rounded-md px-2",
        tone === "live" ? "bg-live/15" : "bg-sunken",
      )}
    >
      {tone === "live" ? <View className="size-1.5 rounded-full bg-live" /> : null}
      <Text className={cn("text-xs font-medium", tone === "live" ? "text-live" : "text-muted")}>
        {children}
      </Text>
    </View>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: string;
  action?: ReactNode;
}) {
  return (
    <View className="gap-2 py-2">
      <Text className="text-base font-semibold text-ink">{title}</Text>
      {children ? <Text className="text-sm text-muted">{children}</Text> : null}
      {action}
    </View>
  );
}

/** A placeholder block. For text, prefer `SkeletonText`, which sits in a real line box. */
export function Skeleton({ className }: { className?: string }) {
  return <View accessibilityElementsHidden className={cn("rounded-md bg-fill", className)} />;
}
