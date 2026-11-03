import { Link, type LinkProps } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "./cn";

/** A raised card on the canvas. */
export function Surface({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("rounded-xl bg-surface shadow-(--elevation-card)", className)} {...props} />
  );
}

/** A card of rows, with a line between each. */
export function List({
  as: Tag = "div",
  label,
  children,
}: {
  as?: "div" | "ol" | "ul";
  label?: string;
  children: ReactNode;
}) {
  return (
    <Surface className="overflow-hidden">
      <Tag aria-label={label} className="divide-y divide-line">
        {children}
      </Tag>
    </Surface>
  );
}

const row = "flex min-h-14 items-center gap-3 px-4 py-3";
const pressable =
  "transition-colors duration-150 hover:bg-sunken active:bg-sunken focus-visible:outline-offset-[-2px]";

export function Row({
  as: Tag = "div",
  className,
  children,
}: {
  as?: "div" | "span";
  className?: string;
  children: ReactNode;
}) {
  return <Tag className={cn(row, className)}>{children}</Tag>;
}

/** A row that goes somewhere. */
export function RowLink({
  children,
  ...props
}: LinkProps & { children: ReactNode; "aria-label"?: string }) {
  return (
    <Link className={cn(row, pressable)} {...props}>
      {children}
      <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
    </Link>
  );
}

/** A row's main text: what it is, and a quieter line about it. */
export function RowText({
  title,
  meta,
  struck = false,
}: {
  title: ReactNode;
  meta?: ReactNode;
  struck?: boolean;
}) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className={cn("font-medium wrap-anywhere", struck && "text-muted line-through")}>
        {title}
      </span>
      {meta ? <span className="text-sm text-pretty text-muted">{meta}</span> : null}
    </span>
  );
}

export function Tag({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "live";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium",
        tone === "live" ? "bg-live/15 text-live" : "bg-sunken text-muted",
      )}
    >
      {tone === "live" ? <span className="size-1.5 rounded-full bg-live" aria-hidden /> : null}
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-sunken", className)} />;
}

/** A soft light behind a hero card's figure, in the color of how it's going. Put it first inside a `relative overflow-hidden` card. */
export function Glow({ tone }: { tone: "win" | "loss" | "accent" }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute -top-24 -right-20 size-72 rounded-full blur-3xl [[data-theme=light]_&]:opacity-50",
        tone === "win" ? "bg-win/20" : tone === "loss" ? "bg-loss/15" : "bg-accent/15",
      )}
    />
  );
}
