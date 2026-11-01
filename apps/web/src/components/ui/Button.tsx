import { Link, type LinkProps } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap select-none " +
  "transition-[background-color,color,transform,box-shadow] duration-150 active:scale-[0.98] " +
  "disabled:pointer-events-none disabled:bg-disabled disabled:text-muted disabled:shadow-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-ink shadow-sm hover:bg-[color-mix(in_oklch,var(--color-accent)_88%,var(--color-canvas))]",
  secondary:
    "bg-surface text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-sunken",
  ghost: "text-ink hover:bg-sunken",
  danger:
    "bg-surface text-danger shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-sunken",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

const classes = (variant: Variant, size: Size, className?: string) =>
  cn(base, variants[variant], sizes[size], className);

export function Button({
  variant = "secondary",
  size = "md",
  type = "button",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={classes(variant, size, className)} {...props} />;
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
