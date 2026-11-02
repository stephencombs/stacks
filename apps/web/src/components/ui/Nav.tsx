import { Link, type LinkProps } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "./cn";

/** The way up to the page this one sits in. */
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

/** A row of tabs that are links, the current one underlined. */
export function Tabs({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav aria-label={label} className="flex gap-6 overflow-x-auto border-b border-line">
      {children}
    </nav>
  );
}

export function Tab({
  current,
  children,
  ...props
}: LinkProps & { current: boolean; children: ReactNode }) {
  return (
    <Link
      aria-current={current ? "page" : undefined}
      className={cn(
        "relative inline-flex h-11 min-w-10 items-center justify-center type-callout font-medium whitespace-nowrap transition-colors duration-150 focus-visible:outline-offset-[-2px] pointer-coarse:min-w-11",
        "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full",
        current ? "text-ink after:bg-ink" : "text-muted hover:text-ink",
      )}
      {...props}
    >
      {children}
    </Link>
  );
}
