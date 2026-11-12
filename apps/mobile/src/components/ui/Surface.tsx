import { NavigationContext, NavigationRouteContext } from "@react-navigation/native";
import { use, useCallback, useLayoutEffect, type ReactNode } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { cn } from "./cn";
import { Icon } from "./Icon";
import { HeaderTitle } from "./HeaderTitle";

export function Surface({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <View className={cn("overflow-hidden rounded-2xl border border-line bg-surface", className)}>
      {children}
    </View>
  );
}

/** @public */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <View
      className={cn("overflow-hidden rounded-2xl border border-line bg-surface p-4", className)}
    >
      {children}
    </View>
  );
}

/** A surface of rows. The list clips the first row's divider, so only gaps between rows show one. */
export function List({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Surface className={className}>
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
  accessibilityLabel,
  accessibilityHint,
  className,
}: {
  children: ReactNode;
  onPress?: () => void;
  /** Replaces what's read out, for a row whose parts read better as one sentence. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  className?: string;
}) {
  const classes = cn("flex-row items-center gap-3 border-t border-line px-4 py-3.5", className);
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
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
export function PageTitle({
  context,
  children,
  tag,
  right,
}: {
  context?: string;
  children: string;
  tag?: ReactNode;
  right?: ReactNode;
}) {
  const navigation = use(NavigationContext);
  const route = use(NavigationRouteContext);
  const nativeTitle = Platform.OS !== "web" && navigation !== undefined;
  const headerTitle = useCallback(
    () => <HeaderTitle title={children} context={context} />,
    [children, context],
  );
  useLayoutEffect(() => {
    if (!nativeTitle) return;
    const scoped = ["Sessions", "Board", "SettleUp", "Group"].includes(route?.name ?? "");
    navigation?.setOptions({
      title: children,
      headerLargeTitle: false,
      ...(Platform.OS === "ios" && !scoped ? { headerTitle } : {}),
    });
  }, [navigation, children, headerTitle, nativeTitle, route?.name]);
  if (nativeTitle && !tag && !right && !context) return null;
  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-row items-center gap-2">
          {nativeTitle ? null : (
            <Text accessibilityRole="header" className="type-title text-ink">
              {children}
            </Text>
          )}
          {tag}
        </View>
        {right}
      </View>
      {context ? <Text className="type-footnote text-muted">{context}</Text> : null}
    </View>
  );
}

export function SectionHeading({
  children,
  action,
  count,
  collapsible,
  collapsed,
  onToggle,
}: {
  children: string;
  action?: ReactNode;
  count?: number | string;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const content = (
    <View className="min-h-7 flex-row items-center gap-2 py-1">
      <Text accessibilityRole="header" className="type-section text-muted">
        {count !== undefined ? `${children} (${count})` : children}
      </Text>
      <View className="h-px flex-1 bg-line" />
      {action}
      {collapsible ? (
        <Icon name={collapsed ? "chevron-right" : "chevron-down"} color="muted" size={14} />
      ) : null}
    </View>
  );

  if (collapsible && onToggle) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        onPress={onToggle}
        className="active:opacity-70"
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

type Tone = "neutral" | "live" | "accent" | "win" | "loss";

const toneStyles: Record<Tone, { container: string; text: string }> = {
  neutral: { container: "bg-sunken", text: "text-muted" },
  live: { container: "bg-live/15", text: "text-live" },
  accent: { container: "bg-accent/15", text: "text-accent-text" },
  win: { container: "bg-win/15", text: "text-win" },
  loss: { container: "bg-loss/15", text: "text-loss" },
};

export function Tag({ tone = "neutral", children }: { tone?: Tone; children: string }) {
  const style = toneStyles[tone];
  return (
    <View
      className={cn(
        "h-6 flex-row items-center gap-1.5 self-start rounded-md px-2",
        style.container,
      )}
    >
      {tone === "live" ? <View className="size-1.5 rounded-full bg-live" /> : null}
      <Text className={cn("text-xs font-medium", style.text)}>{children}</Text>
    </View>
  );
}

/** @public */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: string }) {
  const style = toneStyles[tone];
  return (
    <View
      className={cn(
        "h-6 flex-row items-center gap-1.5 self-start rounded-full px-2.5",
        style.container,
      )}
    >
      {tone === "live" ? <View className="size-1.5 rounded-full bg-live" /> : null}
      <Text className={cn("text-xs font-medium", style.text)}>{children}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  children,
  action,
  centered = false,
}: {
  title: string;
  children?: string;
  action?: ReactNode;
  centered?: boolean;
}) {
  if (centered) {
    return (
      <View className="items-center gap-2 rounded-2xl border border-line bg-surface p-6 text-center">
        <Text className="text-center text-[19px] font-bold text-ink">{title}</Text>
        {children ? <Text className="text-center type-callout text-muted">{children}</Text> : null}
        {action}
      </View>
    );
  }
  return (
    <View className="gap-2 py-2">
      <Text className="text-[19px] font-bold text-ink">{title}</Text>
      {children ? <Text className="type-callout text-muted">{children}</Text> : null}
      {action}
    </View>
  );
}

/** A placeholder block. For text, prefer `SkeletonText`, which sits in a real line box. */
export function Skeleton({ className }: { className?: string }) {
  return <View accessibilityElementsHidden className={cn("rounded-md bg-fill", className)} />;
}

const barTone: Record<"accent" | "win" | "loss" | "muted", string> = {
  accent: "bg-accent",
  win: "bg-win",
  loss: "bg-loss",
  muted: "bg-muted",
};

/** @public */
export function ProportionalBarRow({
  leading,
  title,
  subtitle,
  right,
  share,
  tone = "accent",
  selected = false,
  accessibilityLabel,
  accessibilityHint,
  onPress,
}: {
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  right: ReactNode;
  /** 0 to 1 proportion for the 4px horizontal bar. */
  share: number;
  tone?: "accent" | "win" | "loss" | "muted";
  selected?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View className="flex-row items-center gap-2">
        {leading}
        <Text numberOfLines={1} className="shrink type-heading text-ink">
          {title}
        </Text>
        <View className="flex-1" />
        {right}
      </View>
      <View className="h-1 w-full overflow-hidden rounded-full bg-fill">
        <View
          style={{
            width: `${Math.max(4, Math.min(100, Math.round((Number.isFinite(share) ? share : 0) * 100)))}%`,
          }}
          className={cn("h-full rounded-full", barTone[tone])}
        />
      </View>
      {subtitle ? (
        <Text numberOfLines={1} className="type-footnote text-muted">
          {subtitle}
        </Text>
      ) : null}
    </>
  );

  const classes = "gap-2 border-t border-line px-4 py-3.5";

  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      className={cn(classes, "active:bg-sunken")}
    >
      {content}
    </Pressable>
  ) : (
    <View className={classes}>{content}</View>
  );
}

const quotaTone: Record<"accent" | "win" | "loss" | "danger", string> = {
  accent: "bg-accent",
  win: "bg-win",
  loss: "bg-loss",
  danger: "bg-danger",
};

/** @public */
export function QuotaBar({
  remainingShare,
  paceShare,
  tone = "accent",
}: {
  /** 0 to 1 share remaining (or settled). */
  remainingShare: number;
  /** Optional 0 to 1 pace marker tick position. */
  paceShare?: number;
  tone?: "accent" | "win" | "loss" | "danger";
}) {
  const remainingPct = Math.max(
    0,
    Math.min(100, Math.round((Number.isFinite(remainingShare) ? remainingShare : 0) * 100)),
  );
  const pacePct =
    paceShare !== undefined && Number.isFinite(paceShare)
      ? Math.max(0, Math.min(100, Math.round(paceShare * 100)))
      : undefined;

  return (
    <View className="relative h-6 w-full flex-row overflow-hidden rounded-md border border-line bg-sunken">
      {remainingPct > 0 ? (
        <View style={{ width: `${remainingPct}%` }} className={cn("h-full", quotaTone[tone])} />
      ) : null}
      <View className="h-full flex-1 bg-fill/60" />
      {pacePct !== undefined ? (
        <View
          style={{ left: `${pacePct}%` }}
          className="absolute top-0 bottom-0 -ml-px w-0.5 bg-ink"
        />
      ) : null}
    </View>
  );
}

/** @public */
export function QuotaCard({
  title,
  status,
  figure,
  remainingShare,
  paceShare,
  tone = "accent",
  footer,
  children,
}: {
  title: string;
  status?: string;
  figure: ReactNode;
  remainingShare: number;
  paceShare?: number;
  tone?: "accent" | "win" | "loss" | "danger";
  footer?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card className="gap-3">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="type-heading text-ink">{title}</Text>
        {status ? <Text className="type-footnote text-muted">{status}</Text> : null}
      </View>
      {typeof figure === "string" || typeof figure === "number" ? (
        <Text className="type-hero text-ink">{figure}</Text>
      ) : (
        figure
      )}
      <QuotaBar remainingShare={remainingShare} paceShare={paceShare} tone={tone} />
      {footer ? (
        typeof footer === "string" ? (
          <Text className="type-footnote text-muted">{footer}</Text>
        ) : (
          footer
        )
      ) : null}
      {children}
    </Card>
  );
}

/** @public */
export function SettingsGroup({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View className="gap-2">
      {title ? <SectionHeading action={action}>{title}</SectionHeading> : null}
      <List>{children}</List>
    </View>
  );
}

/** @public */
export function SettingsRow({
  icon,
  title,
  subtitle,
  value,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  trailing,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  value?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  trailing?: ReactNode;
}) {
  const disclosure =
    trailing !== undefined ? (
      trailing
    ) : onPress ? (
      <Icon name="chevron-right" color="faint" size={18} />
    ) : null;

  return (
    <Row
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      className="min-h-13"
    >
      {icon ? (
        <View className="size-7 items-center justify-center rounded-lg bg-fill">{icon}</View>
      ) : null}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={1} className="type-body font-medium text-ink">
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} className="type-footnote text-muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value !== undefined && value !== null ? (
        typeof value === "string" || typeof value === "number" ? (
          <Text className="type-callout text-muted">{value}</Text>
        ) : (
          value
        )
      ) : null}
      {disclosure}
    </Row>
  );
}
