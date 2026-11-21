import type { ReactNode } from "react";
import { View } from "react-native";

import { cn } from "../components/ui/cn";
import { Skeleton } from "../components/ui/Surface";

const lines = {
  sm: ["h-5", "h-3"],
  base: ["h-6", "h-3.5"],
  lg: ["h-7", "h-4"],
  title: ["h-10", "h-8"],
  figure: ["h-16", "h-12"],
} as const;

function SkeletonText({
  size = "base",
  className,
}: {
  size?: keyof typeof lines;
  className?: string;
}) {
  const [box, bar] = lines[size];

  return (
    <View className={cn("justify-center", box, className)}>
      <Skeleton className={cn("w-full", bar)} />
    </View>
  );
}

const titleWidths = ["w-32", "w-44", "w-28", "w-40"];
const keys = (count: number) => Array.from({ length: count }, (_, i) => `placeholder-${i}`);

function SkeletonScreen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View accessible accessibilityLabel={label} accessibilityRole="progressbar" className="gap-6">
      {children}
    </View>
  );
}

function TitleSkeleton({ context = true }: { context?: boolean }) {
  return (
    <View className="gap-1">
      <SkeletonText size="title" className="w-56" />
      {context ? <SkeletonText size="sm" className="w-44" /> : null}
    </View>
  );
}

/** A card of rows at the real row height. */
export function RowsSkeleton({
  rows = 4,
  chip = false,
  meta = true,
  trailing = true,
}: {
  rows?: number;
  chip?: boolean;
  meta?: boolean;
  trailing?: boolean;
}) {
  return (
    <View className="overflow-hidden rounded-xl bg-surface">
      {keys(rows).map((key, i) => (
        <View
          key={key}
          className={cn("flex-row items-center gap-3 px-4 py-3.5", i > 0 && "border-t border-line")}
        >
          {chip ? <Skeleton className="size-[30px] rounded-full" /> : null}
          <View className="flex-1 gap-0.5">
            <SkeletonText className={titleWidths[i % titleWidths.length]!} />
            {meta ? <SkeletonText size="sm" className="w-36" /> : null}
          </View>
          {trailing ? <SkeletonText className="w-14" /> : null}
        </View>
      ))}
    </View>
  );
}

function SectionSkeleton({ action = false, children }: { action?: boolean; children: ReactNode }) {
  return (
    <View className="gap-2">
      <View className={cn("justify-center", action ? "min-h-11" : "min-h-9")}>
        <SkeletonText size="lg" className="w-36" />
      </View>
      {children}
    </View>
  );
}

function HeroSkeleton() {
  return (
    <View className="overflow-hidden rounded-xl bg-surface">
      <View className="px-4 pt-4">
        <SkeletonText size="sm" className="w-20" />
        <SkeletonText size="figure" className="mt-2 w-40" />
        <SkeletonText size="sm" className="mt-1.5 w-48" />
      </View>
      <View className="mt-3 h-24" />
      <View className="flex-row border-t border-line">
        {["w-12", "w-16", "w-14"].map((width, i) => (
          <View
            key={width}
            className={cn("grow gap-0.5 px-4 py-3", i > 0 && "border-l border-line")}
          >
            <SkeletonText size="sm" className="w-14" />
            <SkeletonText size="lg" className={width} />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Sessions loading: the title beside the trip's "…", your live table when you're at one, the trip
 * card, Start a session, and the latest night.
 */
export function SessionsSkeleton() {
  return (
    <SkeletonScreen label="Loading sessions">
      <View className="flex-row items-center justify-between gap-3">
        <SkeletonText size="title" className="w-40" />
        <Skeleton className="size-11 rounded-full" />
      </View>
      <HeroSkeleton />
      <Skeleton className="h-[52px] rounded-full" />
      <SectionSkeleton>
        <RowsSkeleton rows={3} />
      </SectionSkeleton>
    </SkeletonScreen>
  );
}

/** The group loading: its name and who's in it, its trips, its people, its settings. */
export function GroupSkeleton() {
  return (
    <SkeletonScreen label="Loading the group">
      <TitleSkeleton />
      <Skeleton className="h-11 w-24 rounded-full" />
      <SectionSkeleton action>
        <View className="gap-3 rounded-xl bg-surface p-4">
          <View className="gap-1">
            <SkeletonText size="lg" className="w-44" />
            <SkeletonText size="sm" className="w-36" />
          </View>
          <View className="h-[22px] flex-row items-center gap-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-24" />
          </View>
        </View>
        <RowsSkeleton rows={1} meta={false} />
      </SectionSkeleton>
      <SectionSkeleton>
        <MembersSkeleton />
      </SectionSkeleton>
      <SectionSkeleton>
        <RowsSkeleton rows={1} trailing={false} />
      </SectionSkeleton>
    </SkeletonScreen>
  );
}

/** A session loading: title, the table, its three figures, your seat and the players. */
export function SessionScreenSkeleton() {
  return (
    <SkeletonScreen label="Loading the session">
      <View className="gap-3">
        <TitleSkeleton />
        <View className="h-6 flex-row items-center gap-2">
          <Skeleton className="h-6 w-14" />
          <Skeleton className="h-6 w-20" />
          <SkeletonText size="sm" className="w-16" />
        </View>
      </View>
      <Skeleton className="-mx-4 aspect-[1.8] rounded-none" />
      <View className="flex-row overflow-hidden rounded-xl bg-surface">
        {["w-6", "w-16", "w-14"].map((width, i) => (
          <View
            key={width}
            className={cn("grow gap-0.5 px-4 py-3", i > 0 && "border-l border-line")}
          >
            <SkeletonText size="sm" className="w-12" />
            <SkeletonText size="lg" className={width} />
          </View>
        ))}
      </View>
      <View className="rounded-xl bg-surface p-4">
        <View className="flex-row items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <View>
            <SkeletonText size="sm" className="w-28" />
            <View className="h-[52px] justify-center">
              <Skeleton className="h-10 w-24" />
            </View>
          </View>
        </View>
        <View className="mt-4 flex-row gap-3">
          <Skeleton className="h-[52px] flex-1 rounded-full" />
          <Skeleton className="h-[52px] flex-1 rounded-full" />
        </View>
      </View>
      <SectionSkeleton>
        <RowsSkeleton rows={3} chip />
      </SectionSkeleton>
    </SkeletonScreen>
  );
}

/** An invite link loading: the link, when it expires, then Share and Revoke. */
export function InviteLinkSkeleton() {
  return (
    <View className="gap-2 rounded-xl bg-surface px-4 py-3.5">
      <SkeletonText size="sm" className="w-64" />
      <SkeletonText size="sm" className="w-48" />
      <View className="flex-row gap-2">
        <Skeleton className="h-11 flex-1 rounded-full" />
        <View className="w-24" />
      </View>
    </View>
  );
}

function MembersSkeleton() {
  return (
    <View className="overflow-hidden rounded-xl bg-surface">
      {keys(4).map((key, i) => (
        <View
          key={key}
          className={cn("flex-row items-center gap-3 px-4 py-3.5", i > 0 && "border-t border-line")}
        >
          <Skeleton className="size-[26px] rounded-full" />
          <View className="flex-1">
            <SkeletonText className={titleWidths[i % titleWidths.length]!} />
          </View>
          <Skeleton className="h-6 w-16" />
        </View>
      ))}
    </View>
  );
}

/** Group settings loading, titled by its header: the ledger and leaving. */
export function SettingsSkeleton() {
  return (
    <SkeletonScreen label="Loading settings">
      <SectionSkeleton action>
        <View>
          <SkeletonText size="sm" className="w-full" />
          <SkeletonText size="sm" className="w-40" />
        </View>
      </SectionSkeleton>
      <SectionSkeleton>
        <Skeleton className="h-11 rounded-full" />
        <View>
          <SkeletonText size="sm" className="w-full" />
          <SkeletonText size="sm" className="w-28" />
        </View>
      </SectionSkeleton>
    </SkeletonScreen>
  );
}

/** An invite or claim link loading: one card. */
export function InviteScreenSkeleton() {
  return (
    <SkeletonScreen label="Loading the invite">
      <TitleSkeleton />
      <View className="gap-3 rounded-xl bg-surface p-4">
        <SkeletonText className="w-48" />
        <SkeletonText size="sm" className="w-64" />
        <Skeleton className="mt-2 h-[52px] rounded-full" />
      </View>
    </SkeletonScreen>
  );
}
