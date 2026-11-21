import type { ReactNode } from "react";

import { GlassSurface } from "./GlassSurface";

/** The round surface under a 44px icon control: glass that answers the touch. */
export function ControlSurface({
  children,
  felt = false,
}: {
  children: ReactNode;
  felt?: boolean;
}) {
  return (
    <GlassSurface
      radius={22}
      interactive
      felt={felt}
      className="size-11 items-center justify-center rounded-full"
    >
      {children}
    </GlassSurface>
  );
}
