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

/** A page's title, with an optional amber line above it saying where the page sits. */
export function PageTitle({ eyebrow, children }: { eyebrow?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {eyebrow ? (
        <p className="text-[11px] font-semibold tracking-[0.18em] text-accent-text uppercase">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="font-display text-[2.75rem] leading-[0.95] tracking-tight uppercase">
        {children}
      </h1>
    </div>
  );
}

export function SectionHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3">
      <h2 className="text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
        {children}
      </h2>
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
        "inline-flex h-6 items-center gap-1.5 rounded-md px-2 font-mono text-[11px] font-medium tracking-wider uppercase",
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
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-line-strong px-5 py-6">
      <p className="font-display text-2xl leading-tight">{title}</p>
      {children ? <p className="max-w-[60ch] text-sm text-muted">{children}</p> : null}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-sunken", className)} />;
}
