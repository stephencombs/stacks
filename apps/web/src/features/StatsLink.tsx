import { ChartColumn } from "lucide-react";

import { ButtonLink } from "~/components/ui/Button";
import type { StatsPick } from "~/lib/statsPick";

/** Opens Stats with this group (and trip) picked. */
export function StatsLink({
  pick,
  variant = "secondary",
  className,
}: {
  pick: StatsPick;
  variant?: "secondary" | "ghost";
  className?: string;
}) {
  return (
    <ButtonLink
      to="/stats"
      state={{ statsPick: pick }}
      variant={variant}
      {...(className ? { className } : {})}
    >
      <ChartColumn className="size-4" aria-hidden />
      Stats
    </ButtonLink>
  );
}
