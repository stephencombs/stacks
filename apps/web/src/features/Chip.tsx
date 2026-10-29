import type { CSSProperties } from "react";

/** A player's casino chip: striped edge, solid face, their initial. `chip` is 1 to 8. */
export function Chip({ chip, name, size = 32 }: { chip: number; name: string; size?: number }) {
  const face = `var(--color-chip-${chip})`;
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-full shadow-[0_1px_2px_oklch(0_0_0/0.3),inset_0_0_0_1px_oklch(0_0_0/0.15)]"
      style={
        {
          width: size,
          height: size,
          background: `repeating-conic-gradient(from 7.5deg, ${face} 0 30deg, var(--color-chip-edge) 30deg 45deg)`,
        } as CSSProperties
      }
    >
      <span
        className="grid place-items-center rounded-full font-semibold"
        style={{
          width: size * 0.66,
          height: size * 0.66,
          background: face,
          color: `var(--color-chip-${chip}-ink)`,
          fontSize: size * 0.34,
          boxShadow: `inset 0 0 0 ${Math.max(1, size * 0.04)}px oklch(1 0 0 / 0.55)`,
        }}
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
    </span>
  );
}
