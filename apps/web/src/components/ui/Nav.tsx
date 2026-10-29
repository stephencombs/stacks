import { Link, type LinkProps } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "./cn";

/** The way up to the page this one sits in. */
export function BackLink({ children, ...props }: LinkProps & { children: ReactNode }) {
  return (
    <Link
      className="-ml-1 inline-flex min-h-9 items-center gap-1 self-start text-xs font-semibold tracking-[0.14em] text-muted uppercase hover:text-ink"
      {...props}
    >
      <ChevronLeft className="size-4" aria-hidden />
      {children}
    </Link>
  );
}

/** A row of tabs that are links, underlined in amber at the current one. */
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
        "relative inline-flex h-11 items-center text-xs font-semibold tracking-[0.14em] whitespace-nowrap uppercase transition-colors duration-150 focus-visible:outline-offset-[-2px]",
        "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full",
        current ? "text-ink after:bg-accent" : "text-muted hover:text-ink",
      )}
      {...props}
    >
      {children}
    </Link>
  );
}
