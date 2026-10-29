import type { ComponentProps, ReactNode } from "react";

import { cn } from "./cn";

/** A raised card on the canvas. */
export function Surface({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "rounded-xl bg-surface shadow-[0_0_0_1px_var(--color-line),0_1px_2px_rgb(0_0_0/0.04),0_2px_8px_-2px_rgb(0_0_0/0.05)]",
        className,
      )}
      {...props}
    />
  );
}

/** The one title on a page, with an optional line under it saying where the page sits. */
export function PageTitle({ context, children }: { context?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h1 className="font-display text-[2.5rem] leading-[0.95] tracking-[-0.01em] uppercase">
        {children}
      </h1>
      {context ? <p className="text-sm text-muted">{context}</p> : null}
    </div>
  );
}

export function SectionHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold text-ink">{children}</h2>
      {action}
    </div>
  );
}

export function Tag({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "live" | "voided";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md px-2 font-mono text-[11px] font-medium tracking-[0.08em] uppercase",
        tone === "live" && "bg-[color-mix(in_oklch,var(--color-live)_16%,transparent)] text-live",
        tone === "neutral" && "bg-sunken text-muted",
        tone === "voided" && "bg-sunken text-muted line-through",
      )}
    >
      {tone === "live" ? <span className="size-1.5 rounded-full bg-live" aria-hidden /> : null}
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 py-2">
      <p className="font-semibold">{title}</p>
      {children ? <p className="max-w-[60ch] text-sm text-muted">{children}</p> : null}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-sunken", className)} />;
}
