import { cn } from "./ui/cn";

/** The Color Up mark: a chip rack from above, its columns the night's stacks, the tallest in gold. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("shrink-0", className)}>
      <rect
        x="8"
        y="10"
        width="48"
        height="44"
        rx="8"
        strokeWidth="5"
        className="fill-none stroke-ink"
      />
      <rect x="15" y="31" width="7" height="16" rx="3.5" className="fill-chip-2" />
      <rect x="24.5" y="22" width="7" height="25" rx="3.5" className="fill-chip-1" />
      <rect x="34" y="27" width="7" height="20" rx="3.5" className="fill-chip-3" />
      <rect x="43.5" y="17" width="7" height="30" rx="3.5" className="fill-accent" />
    </svg>
  );
}
