import { useAtomValue } from "@effect/atom-react";
import { useParams } from "@tanstack/react-router";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { useState, type ReactNode } from "react";

import { cn } from "~/components/ui/cn";
import { Skeleton, Surface } from "~/components/ui/Surface";
import { useLastTrip, useStacks } from "~/lib/stacks";
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

/** When the latest navigation started, so a skeleton's delay counts from then. */
let navigatedAt = 0;
export const markNavigation = () => {
  navigatedAt = performance.now();
};

/**
 * A whole page loading: announced once, and only shown once the wait is long enough to see. A page
 * that loads in stages remounts its skeleton, so the delay is measured from the navigation rather
 * than from the mount; otherwise each stage would start the wait again and the page would blink.
 */
function SkeletonPage({ label, children }: { label: string; children: ReactNode }) {
  const [waited] = useState(() => performance.now() - navigatedAt);
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

/** A page's title block. A place's title is one short word; a group's or venue's runs longer. */
function HeaderSkeleton({
  back = false,
  context = false,
  action = false,
  menu = false,
  title = "w-40",
  children,
}: {
  back?: boolean;
  context?: boolean;
  action?: boolean;
  menu?: boolean;
  title?: string;
  children?: ReactNode;
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
          <SkeletonText size="title" className={title} />
          {context ? <SkeletonText size="sm" className="w-44" /> : null}
        </div>
        {action || menu ? (
          <div className="flex items-center gap-2">
            {action ? <Skeleton className="h-10 w-40 rounded-lg pointer-coarse:h-11" /> : null}
            {menu ? <Skeleton className="size-10 rounded-lg pointer-coarse:size-11" /> : null}
          </div>
        ) : null}
      </div>
      {children}
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

/** A hero card: label, figure, comparison, then the trip card's line and tiles, or the race's chart. */
function HeroSkeleton({
  chart = "line",
  tiles = true,
}: {
  chart?: "line" | "race" | null;
  tiles?: boolean;
}) {
  return (
    <Surface className="overflow-hidden">
      <div className="flex flex-col px-4 pt-4">
        <div className="flex items-center justify-between">
          <SkeletonText size="sm" className="w-20" />
          {chart === "line" ? <SkeletonText size="sm" className="w-32" /> : null}
        </div>
        <SkeletonText size="figure" className="mt-2 w-40" />
        <SkeletonText size="sm" className="mt-1.5 w-48" />
      </div>
      {chart === "line" ? (
        <div className="mt-3 h-24" />
      ) : chart === "race" ? (
        <div className="mt-3 mb-4 h-32" />
      ) : (
        <div className="h-4" />
      )}
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

/** Your live table's card, as Sessions opens on it. */
function LiveCardSkeleton() {
  return (
    <Surface className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-24 rounded-md" />
        <SkeletonText size="sm" className="w-24" />
      </div>
      <div className="flex flex-col gap-1">
        <span className="flex h-[30px] items-center">
          <Skeleton className="h-6 w-44" />
        </span>
        <SkeletonText size="sm" className="w-36" />
      </div>
      <Skeleton className="h-12 w-full rounded-lg" />
    </Surface>
  );
}

function RailSkeleton() {
  return (
    <>
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
      <Surface className="flex flex-col p-4">
        <SkeletonText size="sm" className="w-24" />
        <span className="mt-2 flex h-9 items-center">
          <Skeleton className="h-8 w-28" />
        </span>
        <SkeletonText size="sm" className="mt-1.5 w-44" />
        <Skeleton className="mt-4 h-10 w-full rounded-lg" />
      </Surface>
    </>
  );
}

/** Whether you're seated at a live table in this trip, which Sessions shows first. */
function useSeatedIn(tripId: string | undefined) {
  const stacks = useStacks();
  const groups = AsyncResult.getOrElse(useAtomValue(stacks.groups), () => []);
  return groups.some((item) => item.mySession !== null && item.mySession.tripId === tripId);
}

/** A trip place loading: its title, then the place's own shape; Sessions keeps its rail. */
export function TripPageSkeleton({
  on,
  scope = "trip",
}: {
  on: "sessions" | "board";
  scope?: "trip" | "all";
}) {
  const params: { tripId?: string } = useParams({ strict: false });
  const { lastTripId } = useLastTrip();
  const seated = useSeatedIn(params.tripId ?? lastTripId ?? undefined);
  if (on === "sessions")
    return (
      <SkeletonPage label="Loading the trip">
        <HeaderSkeleton back action menu />
        <TripLayout rail={<RailSkeleton />}>
          {seated ? <LiveCardSkeleton /> : null}
          <HeroSkeleton />
          <SectionSkeleton aside>
            <RowsSkeleton rows={3} />
          </SectionSkeleton>
        </TripLayout>
      </SkeletonPage>
    );
  return (
    <SkeletonPage label="Loading the board">
      <HeaderSkeleton back title="w-28">
        <Skeleton className="h-12 w-48 rounded-lg pointer-coarse:h-[52px]" />
      </HeaderSkeleton>
      <HeroSkeleton chart={scope === "trip" ? "race" : "line"} tiles={scope === "all"} />
      <SectionSkeleton aside={scope === "trip"}>
        <RowsSkeleton rows={5} chip />
      </SectionSkeleton>
    </SkeletonPage>
  );
}

/** A session loading: header, the table, its three figures, your seat and the players. */
export function SessionPageSkeleton() {
  return (
    <SkeletonPage label="Loading the session">
      <HeaderSkeleton back context title="w-56 sm:w-72" />
      <div className="flex flex-col gap-3">
        <Skeleton className="-mx-4 aspect-[1.8] rounded-none sm:mx-0 sm:rounded-2xl" />
        <Skeleton className="h-12 w-56 rounded-lg pointer-coarse:h-[52px]" />
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

/** The hub's trips: the running one with its leaders under it, then an ended one. */
function TripRowsSkeleton() {
  return (
    <Surface className="overflow-hidden">
      <div className="divide-y divide-line">
        <div className="flex flex-col gap-2 px-4 py-3">
          <span className="flex flex-col gap-0.5">
            <SkeletonText className="w-36" />
            <SkeletonText size="sm" className="w-24" />
          </span>
          <span className="flex h-[22px] items-center gap-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-24" />
          </span>
        </div>
        <div className="flex min-h-14 flex-col gap-0.5 px-4 py-3">
          <SkeletonText className="w-44" />
          <SkeletonText size="sm" className="w-28" />
        </div>
      </div>
    </Surface>
  );
}

/** A Group page loading: the hub's trips, people and settings, or People's lists, or Settings. */
export function GroupPageSkeleton({ on }: { on: "hub" | "people" | "settings" }) {
  return (
    <SkeletonPage label="Loading the group">
      {on === "hub" ? (
        <>
          <HeaderSkeleton context title="w-56 sm:w-72" />
          <SectionSkeleton>
            <TripRowsSkeleton />
          </SectionSkeleton>
          <SectionSkeleton>
            <RowsSkeleton rows={1} chip trailing={false} />
          </SectionSkeleton>
          <SectionSkeleton>
            <RowsSkeleton rows={1} trailing={false} />
          </SectionSkeleton>
        </>
      ) : on === "people" ? (
        <>
          <HeaderSkeleton back />
          <SectionSkeleton>
            <RowsSkeleton rows={4} chip trailing={false} />
          </SectionSkeleton>
          <SectionSkeleton>
            <RowsSkeleton rows={1} chip trailing={false} />
          </SectionSkeleton>
        </>
      ) : (
        <>
          <HeaderSkeleton back />
          <SectionSkeleton>
            <SkeletonText size="sm" className="w-80 max-w-full" />
          </SectionSkeleton>
          <SectionSkeleton>
            <Skeleton className="h-10 w-36 rounded-lg pointer-coarse:h-11" />
            <SkeletonText size="sm" className="w-80 max-w-full" />
          </SectionSkeleton>
          <SectionSkeleton>
            <Skeleton className="h-10 w-32 rounded-lg pointer-coarse:h-11" />
            <SkeletonText size="sm" className="w-64 max-w-full" />
          </SectionSkeleton>
        </>
      )}
    </SkeletonPage>
  );
}

/** Fields at the height of real ones, each with its label. */
function FieldsSkeleton({ fields }: { fields: number }) {
  return (
    <div className="flex flex-col gap-5">
      {keys(fields).map((key) => (
        <div key={key} className="flex flex-col gap-1.5">
          <SkeletonText size="sm" className="w-24" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

/** A form page loading: header, then fields. */
export function FormPageSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <SkeletonPage label="Loading">
      <HeaderSkeleton back context title="w-56 sm:w-72" />
      <FieldsSkeleton fields={fields} />
    </SkeletonPage>
  );
}

/** An invite or claim link loading: one card, as tall as the one that replaces it. */
export function InviteSkeleton() {
  return (
    <SkeletonPage label="Loading the invite">
      <HeaderSkeleton context title="w-56 sm:w-72" />
      <Surface className="flex flex-col gap-3 p-4">
        <SkeletonText className="w-48" />
        <SkeletonText size="sm" className="w-64" />
        <Skeleton className="mt-2 h-12 w-full rounded-lg" />
      </Surface>
    </SkeletonPage>
  );
}
