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

function SectionSkeleton({ children }: { children: ReactNode }) {
  return (
    <View className="gap-2">
      <View className="min-h-9 justify-center">
        <SkeletonText size="lg" className="w-36" />
      </View>
      {children}
    </View>
  );
}

/** The trip card: label, figure, comparison, a 96px chart and three tiles. */
function HeroSkeleton({ chart = true, tiles = true }: { chart?: boolean; tiles?: boolean }) {
  return (
    <View className="overflow-hidden rounded-xl bg-surface">
      <View className="px-4 pt-4">
        <SkeletonText size="sm" className="w-20" />
        <SkeletonText size="figure" className="mt-2 w-40" />
        <SkeletonText size="sm" className="mt-1.5 w-48" />
      </View>
      {chart ? <View className="mt-3 h-24" /> : <View className="h-4" />}
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

/** A trip tab loading: the title, then the tab's own shape. */
export function TripScreenSkeleton({ tab }: { tab: "table" | "board" | "money" }) {
  return (
    <View className="flex-1 bg-canvas">
      <View className="px-4 pt-4">
        <SkeletonScreen label="Loading the trip">
          <TitleSkeleton />
          {tab === "money" ? (
            <>
              <HeroSkeleton chart={false} tiles={false} />
              <SectionSkeleton>
                <RowsSkeleton rows={4} chip meta={false} />
              </SectionSkeleton>
            </>
          ) : (
            <>
              <HeroSkeleton tiles={tab === "table"} />
              {tab === "table" ? <Skeleton className="h-[52px] rounded-full" /> : null}
              <SectionSkeleton>
                <RowsSkeleton rows={4} chip={tab === "board"} />
              </SectionSkeleton>
            </>
          )}
        </SkeletonScreen>
      </View>
    </View>
  );
}

/** A session loading: title, the table, its three figures, your seat and the players. */
export function SessionScreenSkeleton() {
  return (
    <SkeletonScreen label="Loading the session">
      <TitleSkeleton />
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

/** A list screen loading: its title, then rows. */
export function ListScreenSkeleton({
  rows = 4,
  hero = false,
  label,
}: {
  rows?: number;
  hero?: boolean;
  label: string;
}) {
  return (
    <SkeletonScreen label={label}>
      <TitleSkeleton context={false} />
      {hero ? <HeroSkeleton /> : null}
      <SectionSkeleton>
        <RowsSkeleton rows={rows} />
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
