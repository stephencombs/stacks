import { Link, type LinkProps } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "./cn";

/** The way back to the place this page was pushed onto. */
export function BackLink({ children, ...props }: LinkProps & { children: ReactNode }) {
  return (
    <Link
      className="-ml-1 inline-flex min-h-10 items-center gap-1 self-start text-sm text-muted hover:text-ink pointer-coarse:min-h-11"
      {...props}
    >
      <ChevronLeft className="size-4" aria-hidden />
      {children}
    </Link>
  );
}

/**
 * One of the four places. `bar` is an item in the bottom bar on narrow screens, icon over label;
 * `side` is a row in the sidebar on wide ones. With no `to` yet, it holds its place, inert.
 */
export function PlaceLink({
  icon,
  label,
  current,
  layout,
  ...props
}: LinkProps & { icon: ReactNode; label: string; current: boolean; layout: "bar" | "side" }) {
  return (
    <Link
      aria-current={current ? "page" : undefined}
      aria-disabled={props.to === undefined || undefined}
      className={cn(
        props.to === undefined && "pointer-events-none",
        "transition-[color,background-color,box-shadow,scale] duration-150 active:scale-[0.96] focus-visible:outline-offset-[-2px]",
        layout === "bar"
          ? "flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium"
          : "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium pointer-coarse:h-11",
        current
          ? layout === "bar"
            ? "text-accent-text"
            : "bg-surface text-ink shadow-(--elevation-card) [&_svg]:text-accent-text"
          : layout === "bar"
            ? "text-muted hover:text-ink"
            : "text-muted hover:bg-sunken hover:text-ink",
      )}
      {...props}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}

/**
 * Where you are: the trip in scope with its group over it, as a button that opens the scope sheet.
 * A group with no trips shows its name alone.
 */
export function ScopeButton({
  context,
  label,
  className,
  ...props
}: Omit<ComponentProps<"button">, "children"> & { context?: string | undefined; label: string }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-11 min-w-0 items-center gap-2 rounded-lg bg-surface py-1 pr-2.5 pl-3 text-left shadow-(--elevation-control) transition-[background-color,scale] duration-150 hover:bg-sunken active:scale-[0.96]",
        className,
      )}
      {...props}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        {context ? <span className="truncate text-xs text-muted">{context}</span> : null}
        <span className="truncate font-semibold">{label}</span>
      </span>
      <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
    </button>
  );
}
