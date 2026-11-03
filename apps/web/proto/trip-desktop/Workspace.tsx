// Workspace: a desktop app shell. A sidebar replaces the header tabs and trip switcher; the canvas is wide charts and a grid of sessions.
import { ChevronsUpDown, List, Trophy, Wallet, Users, ChartLine } from "lucide-react";

import { Money } from "~/components/Money";
import { BrandMark } from "~/components/BrandMark";
import { Button } from "~/components/ui/Button";
import { Glow, Surface, Tag } from "~/components/ui/Surface";
import { RaceHero } from "~/features/RaceHero";
import { TripHero } from "~/features/TripHero";
import { formatDuration, formatTime } from "@stacks/client-runtime/format";
import * as DateTime from "effect/DateTime";
import { closed, currency, group, live, me, trip } from "./sample";
import { day, game, mineIn, StartSession } from "./shared";

const navItem = (active: boolean) =>
  `flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium ${active ? "bg-fill text-ink" : "text-muted hover:bg-fill/60 hover:text-ink"}`;

export function Workspace() {
  const mineLive = mineIn(live, me);
  return (
    <div className="grid min-h-dvh grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 flex h-dvh flex-col gap-6 border-r border-line bg-sunken px-3 py-4">
        <span className="flex min-h-11 items-center gap-2 px-2 font-display text-2xl tracking-wide uppercase">
          <BrandMark className="size-7" />
          Color Up
        </span>
        <button className="flex min-h-11 items-center justify-between rounded-lg bg-surface px-3 text-left shadow-(--elevation-card)">
          <span className="flex flex-col">
            <span className="text-xs text-muted">Group</span>
            <span className="font-medium">{group.group.name}</span>
          </span>
          <ChevronsUpDown className="size-4 text-muted" aria-hidden />
        </button>
        <nav aria-label="Trips" className="flex flex-col gap-1">
          <span className="px-3 pb-1 text-xs font-medium text-muted">Trips</span>
          {group.trips.map((t) => (
            <a key={t.id} href="#" className={navItem(t.id === trip.trip.id)}>
              <span className="min-w-0 flex-1 truncate">{t.name}</span>
              {t.endedAt === null ? <span className="size-2 rounded-full bg-live" aria-label="Live" /> : null}
            </a>
          ))}
        </nav>
        <nav aria-label="Trip" className="flex flex-col gap-1">
          <span className="px-3 pb-1 text-xs font-medium text-muted">{trip.trip.name}</span>
          <a href="#" aria-current="page" className={navItem(true)}><List className="size-4" aria-hidden />Sessions</a>
          <a href="#" className={navItem(false)}><Trophy className="size-4" aria-hidden />Results</a>
          <a href="#" className={navItem(false)}><Wallet className="size-4" aria-hidden />Settle up</a>
        </nav>
        <nav aria-label="Group" className="mt-auto flex flex-col gap-1">
          <a href="#" className={navItem(false)}><Users className="size-4" aria-hidden />People</a>
          <a href="#" className={navItem(false)}><ChartLine className="size-4" aria-hidden />All-time stats</a>
          <div className="flex min-h-11 items-center gap-3 px-3 pt-2">
            <span className="grid size-8 place-items-center rounded-full bg-chip-1 text-sm font-semibold text-chip-1-ink">M</span>
            <span className="text-sm font-medium">Maya</span>
          </div>
        </nav>
      </aside>
      <main className="mx-auto flex w-full max-w-[1240px] min-w-0 flex-col gap-8 px-10 pt-8 pb-28">
        <header className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted">Fri 30 Oct – now · {closed.length + 1} sessions</span>
            <h1 className="type-title">{trip.trip.name}</h1>
          </div>
          <StartSession />
        </header>
        <Surface className="relative overflow-hidden">
          <Glow tone="accent" />
          <div className="relative flex items-center gap-6 px-5 py-4">
            <Tag tone="live">Live · {formatDuration(live.session.startedAt, DateTime.nowUnsafe())}</Tag>
            <div className="flex min-w-0 flex-1 items-baseline gap-3">
              <span className="truncate font-display text-3xl leading-none uppercase">{live.venue.name}</span>
              <span className="text-sm text-muted">{game(live)} · {live.playing.length} at the table · since {formatTime(live.session.startedAt)}</span>
            </div>
            {mineLive ? (
              <div className="flex flex-col items-end">
                <span className="text-xs text-muted">In play</span>
                <Money amount={mineLive.buyIn} currency={currency} className="text-xl font-semibold" />
              </div>
            ) : null}
            <Button variant="primary">Back to the table</Button>
          </div>
        </Surface>
        <div className="grid grid-cols-2 items-start gap-6">
          <TripHero currency={currency} me={me} sessions={closed} />
          <RaceHero detail={group} trip={trip} />
        </div>
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Past sessions</h2>
          <div className="grid grid-cols-3 gap-4">
            {closed.toReversed().map((s) => {
              const mine = mineIn(s, me);
              return (
                <a key={s.session.id} href="#" className="flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-(--elevation-card) transition-colors duration-150 [@media(hover:hover)]:hover:bg-fill">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium" title={s.venue.name}>{s.venue.name}</span>
                    <span className="text-sm text-muted">{game(s)} · {day(s)}</span>
                  </div>
                  <div className="flex items-end justify-between">
                    {mine ? <Money amount={mine.net} currency={currency} tone="result" className="font-display text-3xl leading-none" /> : <span className="text-muted">Sat out</span>}
                    <span className="text-sm text-muted">{s.playerIds.length} players</span>
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
