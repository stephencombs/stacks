import { formatDay, gameNames } from "@stacks/client-runtime/format";
import { Plus } from "lucide-react";
import { Moon } from "lucide-react";

import { BrandMark } from "~/components/BrandMark";
import { Button } from "~/components/ui/Button";
import { Tag } from "~/components/ui/Surface";
import { group, trip } from "./sample";

export const day = (s: (typeof trip.sessions)[number]) => formatDay(s.session.startedAt);
export const game = (s: (typeof trip.sessions)[number]) => gameNames[s.session.game];
export const mineIn = (s: (typeof trip.sessions)[number], id: string) =>
  s.results.find((r) => r.playerId === id);

export function AppBar({ wide = true }: { wide?: boolean }) {
  return (
    <div className={`mx-auto flex h-16 w-full items-center justify-between ${wide ? "max-w-[1200px] px-8" : "max-w-2xl px-4"}`}>
      <span className="flex min-h-11 items-center gap-2 font-display text-2xl tracking-wide uppercase">
        <BrandMark className="size-7" />
        Color Up
      </span>
      <div className="flex items-center gap-3">
        <button aria-label="Theme" className="grid size-10 place-items-center rounded-lg text-muted hover:bg-fill"><Moon className="size-5" aria-hidden /></button>
        <span className="grid size-8 place-items-center rounded-full bg-chip-1 text-sm font-semibold text-chip-1-ink">M</span>
      </div>
    </div>
  );
}

export function StartSession({ variant = "secondary" }: { variant?: "primary" | "secondary" }) {
  return (
    <Button variant={variant}>
      <Plus className="size-4" aria-hidden />
      Start a session
    </Button>
  );
}

export function TripTitle() {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-sm text-muted">{group.group.name} · Fri 30 Oct – now</span>
      <div className="flex items-center gap-3">
        <h1 className="type-title truncate">{trip.trip.name}</h1>
        <Tag tone="live">Live</Tag>
      </div>
    </div>
  );
}

export function TabRow({ current = "Sessions" }: { current?: string }) {
  return (
    <nav aria-label="Trip" className="flex gap-6 border-b border-line">
      {["Sessions", "Results", "Settle up"].map((t) => (
        <a
          key={t}
          href="#"
          aria-current={t === current ? "page" : undefined}
          className={`relative inline-flex h-11 items-center type-callout font-medium after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full ${t === current ? "text-ink after:bg-ink" : "text-muted hover:text-ink"}`}
        >
          {t}
        </a>
      ))}
    </nav>
  );
}
