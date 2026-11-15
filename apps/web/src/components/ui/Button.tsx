import { Link, type LinkProps } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "./cn";

type Variant = "primary" | "tint" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "pressable relative inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap select-none disabled:pointer-events-none " +
  // A pending button keeps its look, so a save in flight doesn't read as one that's unavailable.
  "disabled:not-aria-busy:bg-fill disabled:not-aria-busy:text-muted disabled:not-aria-busy:shadow-none";

// Disabled, an outline stays an outline: a filled block would outweigh the enabled buttons beside it.
const outlined =
  "shadow-(--elevation-control) disabled:not-aria-busy:bg-transparent disabled:not-aria-busy:shadow-(--elevation-control)";

const variants: Record<Variant, string> = {
  primary:
    "bg-ink text-ink-inverse shadow-[inset_0_-2px_0_rgb(0_0_0/0.18)] hover:bg-[color-mix(in_oklch,var(--color-ink)_88%,var(--color-canvas))]",
  tint: "bg-fill text-ink hover:bg-fill-strong",
  secondary: `bg-surface text-ink hover:bg-fill ${outlined}`,
  ghost: "text-ink hover:bg-fill disabled:not-aria-busy:bg-transparent",
  danger: `bg-surface text-loss hover:bg-fill ${outlined}`,
};

const sizes: Record<Size, string> = {
  // Touch screens get 44px targets; a mouse can use the tighter sizes.
  sm: "h-10 px-3 text-sm pointer-coarse:h-11",
  md: "h-10 px-4 text-sm pointer-coarse:h-11",
  lg: "h-12 px-5 text-base",
};

const classes = (variant: Variant, size: Size, className?: string) =>
  cn(base, variants[variant], sizes[size], className);

export function Button({
  variant = "secondary",
  size = "md",
  type = "button",
  pending = false,
  disabled = false,
  className,
  children,
  ...props
}: ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner and blocks presses while a request is in flight, at the button's own width. */
  pending?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={classes(variant, size, className)}
      {...props}
    >
      {pending ? (
        <>
          {/* Transparent, not removed: it holds the width and still names the button. */}
          <span className="inline-flex items-center gap-2 opacity-0">{children}</span>
          <LoaderCircle className="absolute size-4 animate-spin" aria-hidden />
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...props
}: LinkProps & { variant?: Variant; size?: Size; className?: string; children: ReactNode }) {
  return (
    <Link className={classes(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}

const iconClasses =
  "glass pressable inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink disabled:pointer-events-none disabled:text-muted";

export function IconButton({ className, ...props }: ComponentProps<"button">) {
  return <button type="button" className={cn(iconClasses, className)} {...props} />;
}

export function IconLink({
  className,
  children,
  ...props
}: LinkProps & { className?: string; children: ReactNode; "aria-label": string }) {
  return (
    <Link className={cn(iconClasses, className)} {...props}>
      {children}
    </Link>
  );
}
