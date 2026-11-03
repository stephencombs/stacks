import { createContext, use, useState, type ReactNode } from "react";

import { cn } from "~/components/ui/cn";
import { Skeleton, Surface } from "~/components/ui/Surface";
import { TripLayout } from "./TripRail";

/*
 * Each page's loading state is drawn at the size of the page it stands in for: the same header,
 * cards, rows and gaps, so nothing moves when the real page arrives. Text sits in a line box the
 * height of the text it replaces, with a shorter bar inside, the way a line of type looks.
 */

const lines = {
  sm: ["h-5", "h-3"], // text-sm
  base: ["h-6", "h-3.5"], // body text, row titles
  lg: ["h-7", "h-4"], // text-lg, section headings
  title: ["h-[38px]", "h-[30px]"], // type-title
  figure: ["h-12 sm:h-[60px]", "h-10 sm:h-[50px]"], // a hero's figure
} as const;

const titleWidths = ["w-32", "w-44", "w-28", "w-40"];
/** Stable keys for a run of identical placeholders. */
const keys = (count: number) => Array.from({ length: count }, (_, i) => `placeholder-${i}`);

/** A line of text that hasn't loaded, `className` setting its width. */
export function SkeletonText({
  size = "base",
  className,
}: {
  size?: keyof typeof lines;
  className?: string;
}) {
  const [box, bar] = lines[size];
  return (
    <span aria-hidden className={cn("flex items-center", box, className)}>
      <Skeleton className={cn("w-full", bar)} />
    </span>
  );
}

/** When the current page was navigated to, so a skeleton's delay counts from then. */
export const PageStart = createContext(0);

/**
 * A whole page loading: announced once, and only shown once the wait is long enough to see. A page
 * that loads in stages remounts its skeleton, so the delay is measured from the navigation rather
 * than from the mount; otherwise each stage would start the wait again and the page would blink.
 */
function SkeletonPage({ label, children }: { label: string; children: ReactNode }) {
  const start = use(PageStart);
  const [waited] = useState(() => performance.now() - start);
  return (
    <div
      role="status"
      aria-label={label}
      className="flex animate-skeleton-in flex-col gap-8"
      style={{ animationDelay: `${Math.max(0, REVEAL_MS - waited)}ms` }}
    >
      {children}
    </div>
  );
}

const REVEAL_MS = 300;

function HeaderSkeleton({
  back = true,
  context = true,
  action = false,
  tabs = 0,
}: {
  back?: boolean;
  context?: boolean;
  action?: boolean;
  tabs?: number;
}) {
  return (
    <div className="flex flex-col gap-3">
      {back ? (
        <div className="flex min-h-9 items-center">
          <SkeletonText size="sm" className="w-28" />
        </div>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <SkeletonText size="title" className="w-56 sm:w-72" />
          {context ? <SkeletonText size="sm" className="w-44" /> : null}
        </div>
        {action ? <Skeleton className="h-10 w-40 rounded-lg" /> : null}
      </div>
      {tabs > 0 ? (
        <div className="flex h-11 items-center gap-6 border-b border-line">
          {["w-16", "w-14", "w-[52px]", "w-12"].slice(0, tabs).map((width) => (
            <SkeletonText key={width} size="sm" className={width} />
          ))}
        </div>
      ) : null}
    </div>
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
    <Surface className="overflow-hidden">
      <div className="divide-y divide-line">
        {keys(rows).map((key, i) => (
          <div key={key} className="flex min-h-14 items-center gap-3 px-4 py-3">
            {chip ? <Skeleton className="size-7 shrink-0 rounded-full" /> : null}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <SkeletonText className={titleWidths[i % titleWidths.length]!} />
              {meta ? <SkeletonText size="sm" className="w-36" /> : null}
            </span>
            {trailing ? <SkeletonText className="w-14" /> : null}
          </div>
        ))}
      </div>
    </Surface>
  );
}

function SectionSkeleton({ children, aside = false }: { children: ReactNode; aside?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-9 items-center justify-between">
        <SkeletonText size="lg" className="w-36" />
        {aside ? <SkeletonText size="sm" className="w-20" /> : null}
      </div>
      {children}
    </div>
  );
}

/** The trip card: label, figure, comparison, a 96px chart and three tiles. */
function HeroSkeleton({ chart = true, tiles = true }: { chart?: boolean; tiles?: boolean }) {
  return (
    <Surface className="overflow-hidden">
      <div className="flex flex-col px-4 pt-4">
        <div className="flex items-center justify-between">
          <SkeletonText size="sm" className="w-20" />
          {chart ? <SkeletonText size="sm" className="w-32" /> : null}
        </div>
        <SkeletonText size="figure" className="mt-2 w-40" />
        <SkeletonText size="sm" className="mt-1.5 w-48" />
      </div>
      {chart ? <div className="mt-3 h-24" /> : <div className="h-4" />}
      {tiles ? (
        <div className="flex divide-x divide-line border-t border-line">
          {["w-12", "w-16", "w-14"].map((width) => (
            <div key={width} className="flex flex-auto flex-col gap-0.5 px-4 py-3">
              <SkeletonText size="sm" className="w-14" />
              <SkeletonText size="lg" className={width} />
            </div>
          ))}
        </div>
      ) : null}
    </Surface>
  );
}

function RailSkeleton({ on }: { on: "sessions" | "results" | "settle" }) {
  return (
    <>
      {on === "results" ? null : (
        <Surface className="overflow-hidden">
          <div className="flex min-h-12 items-center px-4">
            <SkeletonText className="w-14" />
          </div>
          {keys(5).map((key) => (
            <div key={key} className="flex min-h-12 items-center gap-3 px-4">
              <Skeleton className="size-6 shrink-0 rounded-full" />
              <SkeletonText className="flex-1" />
              <SkeletonText className="w-12" />
            </div>
          ))}
          <div className="h-1" />
        </Surface>
      )}
      {on === "settle" ? null : (
        <Surface className="flex flex-col p-4">
          <SkeletonText size="sm" className="w-24" />
          <span className="mt-2 flex h-9 items-center">
            <Skeleton className="h-8 w-28" />
          </span>
          <SkeletonText size="sm" className="mt-1.5 w-44" />
          <Skeleton className="mt-4 h-10 w-full rounded-lg" />
        </Surface>
      )}
    </>
  );
}

/** A trip tab loading: its header and tabs, then the tab's own shape beside the rail. */
export function TripPageSkeleton({ on }: { on: "sessions" | "results" | "settle" }) {
  return (
    <SkeletonPage label="Loading the trip">
      <HeaderSkeleton action={on === "sessions"} tabs={3} />
      <TripLayout rail={<RailSkeleton on={on} />}>
        {on === "results" ? (
          <>
            <div className="flex h-10 items-center gap-4">
              {["w-20", "w-16", "w-12", "w-14"].map((width) => (
                <SkeletonText key={width} size="sm" className={width} />
              ))}
            </div>
            <HeroSkeleton tiles={false} />
            <SectionSkeleton aside>
              <RowsSkeleton rows={5} chip />
            </SectionSkeleton>
          </>
        ) : on === "settle" ? (
          <>
            <HeroSkeleton chart={false} tiles={false} />
            <SectionSkeleton>
              <RowsSkeleton rows={2} chip />
            </SectionSkeleton>
            <SectionSkeleton>
              <RowsSkeleton rows={5} chip meta={false} />
            </SectionSkeleton>
          </>
        ) : (
          <>
            <HeroSkeleton />
            <SectionSkeleton aside>
              <RowsSkeleton rows={5} />
            </SectionSkeleton>
          </>
        )}
      </TripLayout>
    </SkeletonPage>
  );
}

/** A session loading: header, the table, its three figures, your seat and the players. */
export function SessionPageSkeleton() {
  return (
    <SkeletonPage label="Loading the session">
      <HeaderSkeleton />
      <div className="flex flex-col gap-3">
        <Skeleton className="-mx-4 aspect-[1.8] rounded-none sm:mx-0 sm:rounded-2xl" />
        <Skeleton className="h-10 w-56 rounded-lg" />
      </div>
      <Surface className="flex divide-x divide-line">
        {["w-6", "w-16", "w-14"].map((width) => (
          <div key={width} className="flex flex-auto flex-col gap-0.5 px-4 py-3">
            <SkeletonText size="sm" className="w-12" />
            <SkeletonText size="lg" className={width} />
          </div>
        ))}
      </Surface>
      <Surface className="flex flex-col p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex flex-col">
            <SkeletonText size="sm" className="w-28" />
            <span className="flex h-9 items-center sm:h-12">
              <Skeleton className="h-8 w-24 sm:h-10" />
            </span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Skeleton className="h-12 rounded-lg" />
          <Skeleton className="h-12 rounded-lg" />
        </div>
      </Surface>
      <SectionSkeleton>
        <RowsSkeleton rows={4} chip />
      </SectionSkeleton>
    </SkeletonPage>
  );
}

/** A group page loading: its header and tabs, then a list. */
export function GroupPageSkeleton({ rows = 4, hero = false }: { rows?: number; hero?: boolean }) {
  return (
    <SkeletonPage label="Loading the group">
      <HeaderSkeleton context={false} action tabs={4} />
      {hero ? <HeroSkeleton /> : null}
      <SectionSkeleton>
        <RowsSkeleton rows={rows} />
      </SectionSkeleton>
    </SkeletonPage>
  );
}

/** Your groups loading. */
export function GroupsSkeleton() {
  return (
    <SkeletonPage label="Loading your groups">
      <HeaderSkeleton back={false} context={false} action />
      <RowsSkeleton rows={3} trailing={false} />
    </SkeletonPage>
  );
}

/** A form page loading: header, then fields at the height of real ones. */
export function FormPageSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <SkeletonPage label="Loading">
      <HeaderSkeleton />
      <div className="flex flex-col gap-5">
        {keys(fields).map((key) => (
          <div key={key} className="flex flex-col gap-1.5">
            <SkeletonText size="sm" className="w-24" />
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}

/** An invite or claim link loading: one card, as tall as the one that replaces it. */
export function InviteSkeleton() {
  return (
    <SkeletonPage label="Loading the invite">
      <HeaderSkeleton back={false} />
      <Surface className="flex flex-col gap-3 p-4">
        <SkeletonText className="w-48" />
        <SkeletonText size="sm" className="w-64" />
        <Skeleton className="mt-2 h-12 w-full rounded-lg" />
      </Surface>
    </SkeletonPage>
  );
}
