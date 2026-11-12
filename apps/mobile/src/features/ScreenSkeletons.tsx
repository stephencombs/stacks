import type { ReactNode } from "react";
import { View } from "react-native";

import { cn } from "../components/ui/cn";
import { Skeleton } from "../components/ui/Surface";

/*
 * Each screen's loading state is drawn at the size of the screen it stands in for: the same title,
 * cards, rows and gaps, so nothing moves when the real screen arrives. Text sits in a line box the
 * height of the text it replaces, with a shorter bar inside, the way a line of type looks.
 */

const lines = {
  sm: ["h-5", "h-3"],
  base: ["h-6", "h-3.5"],
  lg: ["h-7", "h-4"],
  title: ["h-10", "h-8"],
  figure: ["h-16", "h-12"],
} as const;

/** A line of text that hasn't loaded, `className` setting its width. */
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

/** A screen loading, announced once to screen readers. */
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

/** A section heading and its content. `action` is a heading with a button, which stands taller. */
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

/**
 * A hero card: label, figure, comparison, then the trip card's 96px chart and three tiles, the
 * race's 128px chart, or neither.
 */
function HeroSkeleton({
  chart = "trip",
  tiles = true,
}: {
  chart?: "trip" | "race" | false;
  tiles?: boolean;
}) {
  return (
    <View className="overflow-hidden rounded-xl bg-surface">
      <View className="px-4 pt-4">
        <SkeletonText size="sm" className="w-20" />
        <SkeletonText size="figure" className="mt-2 w-40" />
        <SkeletonText size="sm" className="mt-1.5 w-48" />
      </View>
      {chart === "trip" ? (
        <View className="mt-3 h-24" />
      ) : chart === "race" ? (
        <View className="mt-3 mb-4 h-32" />
      ) : (
        <View className="h-4" />
      )}
      {tiles ? (
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
      ) : null}
    </View>
  );
}

/*
 * The places. The Board draws its title and its This trip / All time
 * switch before anything loads, so its skeleton starts below it.
 */

/**
 * Sessions loading: the title beside the trip's "…", your live table when you're at one, the trip
 * card, Start a session, and the latest night.
 */
export function SessionsSkeleton({ live = false }: { live?: boolean }) {
  return (
    <SkeletonScreen label="Loading sessions">
      <View className="flex-row items-center justify-between gap-3">
        <SkeletonText size="title" className="w-40" />
        <Skeleton className="size-11 rounded-full" />
      </View>
      {live ? <Skeleton className="h-[200px] rounded-xl" /> : null}
      <HeroSkeleton />
      <Skeleton className="h-[52px] rounded-full" />
      <SectionSkeleton>
        <RowsSkeleton rows={3} />
      </SectionSkeleton>
    </SkeletonScreen>
  );
}

/** The Board for a trip loading: the race, the night it's on, then the standings. */
export function BoardSkeleton() {
  return (
    <SkeletonScreen label="Loading the board">
      <HeroSkeleton chart="race" tiles={false} />
      <View className="flex-row items-end justify-between">
        <View className="gap-1">
          <SkeletonText size="sm" className="w-24" />
          <SkeletonText size="lg" className="w-36" />
        </View>
        <View className="items-end gap-1">
          <SkeletonText size="sm" className="w-10" />
          <SkeletonText size="lg" className="w-16" />
        </View>
      </View>
      {/* Standings has a plain heading, shorter than a section's. */}
      <View className="gap-2">
        <SkeletonText size="lg" className="w-36" />
        <RowsSkeleton rows={4} chip />
      </View>
    </SkeletonScreen>
  );
}

/** The Board across every trip loading: the summary line, your all-time card, then the race. */
export function AllTimeSkeleton() {
  return (
    <SkeletonScreen label="Loading all-time stats">
      {/* "The group has played 6 sessions over 12 hours." takes two lines on a phone. */}
      <View>
        <SkeletonText className="w-full" />
        <SkeletonText className="w-16" />
      </View>
      <HeroSkeleton />
      <View className="gap-1">
        <SkeletonText size="sm" className="w-40" />
        <SkeletonText size="lg" className="w-52" />
        <SkeletonText size="sm" className="w-44" />
      </View>
      <Skeleton className="h-[190px] rounded-xl" />
    </SkeletonScreen>
  );
}

/** The group loading: its name and who's in it, its trips, its people, its settings. */
export function GroupSkeleton() {
  return (
    <SkeletonScreen label="Loading the group">
      <TitleSkeleton />
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
      <SectionSkeleton action>
        <View className="overflow-hidden rounded-xl bg-surface">
          <View className="flex-row gap-4 px-4 py-3.5">
            {keys(4).map((key) => (
              <View key={key} className="w-16 items-center gap-1">
                <Skeleton className="size-[34px] rounded-full" />
                <SkeletonText size="sm" className="w-12" />
                <SkeletonText size="sm" className="w-10" />
              </View>
            ))}
          </View>
          <View className="flex-row items-center gap-3 border-t border-line px-4 py-3.5">
            <View className="flex-1 gap-0.5">
              <SkeletonText className="w-40" />
              <SkeletonText size="sm" className="w-52" />
            </View>
          </View>
        </View>
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

/** People loading, titled by its header: invite links, then members with their roles. */
export function PeopleSkeleton() {
  return (
    <SkeletonScreen label="Loading people">
      <SectionSkeleton action>
        <InviteLinkSkeleton />
      </SectionSkeleton>
      <SectionSkeleton>
        <View className="overflow-hidden rounded-xl bg-surface">
          {keys(4).map((key, i) => (
            <View
              key={key}
              className={cn(
                "flex-row items-center gap-3 px-4 py-3.5",
                i > 0 && "border-t border-line",
              )}
            >
              <Skeleton className="size-[26px] rounded-full" />
              <View className="flex-1">
                <SkeletonText className={titleWidths[i % titleWidths.length]!} />
              </View>
              <Skeleton className="h-6 w-16" />
            </View>
          ))}
        </View>
      </SectionSkeleton>
    </SkeletonScreen>
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

/** A form screen loading: title, then fields at the height of real ones. */
export function FormScreenSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <SkeletonScreen label="Loading">
      <TitleSkeleton />
      {keys(fields).map((key) => (
        <View key={key} className="gap-1.5">
          <SkeletonText size="sm" className="w-24" />
          <Skeleton className="h-12 rounded-xl" />
        </View>
      ))}
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
