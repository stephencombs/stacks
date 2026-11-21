import { cn } from "./cn";

/**
 * A footer's look. With nothing inside (a closed table with no live bar, toast or action) it
 * draws no edge, background or padding, so it doesn't leave an empty strip; the caller still
 * keeps the room under it for the tab bar or home indicator.
 */
export function pinnedFooterChrome({
  filled,
  felt,
  surface,
}: {
  filled: boolean;
  felt: boolean;
  /** Android draws the footer on a surface with a top edge; iOS floats it over the content. */
  surface: boolean;
}) {
  if (!filled) return "";

  return cn(
    "pt-3",
    felt
      ? surface
        ? "border-t border-white/10 bg-felt-deep"
        : "bg-felt"
      : surface && "border-t border-line bg-canvas",
  );
}
