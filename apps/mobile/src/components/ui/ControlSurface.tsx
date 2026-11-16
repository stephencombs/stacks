import type { ReactNode } from "react";

import { GlassSurface } from "./GlassSurface";

/** The round surface under a 44px icon control: glass that answers the touch. */
export function ControlSurface({ children }: { children: ReactNode }) {
  return (
    <GlassSurface
      radius={22}
      interactive
      className="size-11 items-center justify-center rounded-full"
    >
      {children}
    </GlassSurface>
  );
}
