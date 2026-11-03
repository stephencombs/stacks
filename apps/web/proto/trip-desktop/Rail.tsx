// Rail: the trip's main story on the left, everything you'd otherwise tab to pinned on the right.
import { localClock } from "@stacks/client-runtime/trip";
import { tripStandings } from "@stacks/shared/trips";
import { ArrowRight } from "lucide-react";

import { Money } from "~/components/Money";
import { Button } from "~/components/ui/Button";
import { Glow, Surface } from "~/components/ui/Surface";
import { Chip } from "~/features/Chip";
import { LiveSessionCard } from "~/features/SessionList";
import { TripHero } from "~/features/TripHero";
import { chipIndex, closed, currency, group, live, me, nameOf, trip } from "./sample";
import { AppBar, day, game, mineIn, StartSession, TabRow, TripTitle } from "./shared";

export function Rail() {
  const standings = tripStandings(closed as never, localClock).toSorted((a, b) => a.rank - b.rank);
  const owed = trip.transfers.filter((t) => t.to === me);
  return (
    <div className="min-h-dvh pb-28">
      <AppBar />
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-8 pt-2">
        <header className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-4">
            <TripTitle />
            <StartSession />
          </div>
          <TabRow />
        </header>
        <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-8">
          <div className="flex min-w-0 flex-col gap-8">
            <TripHero currency={currency} me={me} sessions={closed} />
            <section className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">Past sessions</h2>
                <span className="text-sm text-muted">{closed.length} sessions</span>
              </div>
              <Surface className="overflow-hidden">
                <table className="w-full text-left">
                  <thead className="text-sm text-muted">
                    <tr className="border-b border-line">
                      <th className="w-[44%] px-4 py-3 font-normal">Venue</th>
                      <th className="px-4 py-3 font-normal">Night</th>
                      <th className="px-4 py-3 text-right font-normal">Players</th>
                      <th className="px-4 py-3 text-right font-normal">Table in</th>
                      <th className="px-4 py-3 text-right font-normal">You</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closed.toReversed().map((s) => {
                      const mine = mineIn(s, me);
                      return (
                        <tr key={s.session.id} className="cursor-pointer border-b border-line last:border-0 [@media(hover:hover)]:hover:bg-sunken">
                          <td className="max-w-0 px-4 py-3">
                            <div className="truncate font-medium">{s.venue.name}</div>
                            <div className="text-sm text-muted">{game(s)}</div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-muted">{day(s)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted">{s.playerIds.length}</td>
                          <td className="px-4 py-3 text-right">
                            <Money amount={s.results.reduce((n, r) => n + r.buyIn, 0)} currency={currency} className="text-muted" />
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {mine ? <Money amount={mine.net} currency={currency} tone="result" /> : <span className="text-faint">Sat out</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Surface>
            </section>
          </div>
          <aside className="sticky top-6 flex flex-col gap-6">
            <LiveSessionCard summary={live} detail={group} />
            <Surface className="overflow-hidden">
              <div className="flex items-baseline justify-between px-4 pt-4 pb-2">
                <h2 className="font-semibold">Board</h2>
                <a href="#" className="text-sm text-muted hover:text-ink">Results</a>
              </div>
              <ol>
                {standings.map((s) => (
                  <li key={s.playerId} className={`flex min-h-12 items-center gap-3 px-4 ${s.playerId === me ? "shadow-[inset_3px_0_0_var(--color-accent)]" : ""}`}>
                    <span className="w-4 text-center text-sm text-muted tabular-nums">{s.rank}</span>
                    <Chip chip={chipIndex(s.playerId)} name={nameOf(s.playerId)} size={24} />
                    <span className="min-w-0 flex-1 truncate font-medium">{nameOf(s.playerId)}</span>
                    <Money amount={s.net} currency={currency} tone="result" className="font-semibold" />
                  </li>
                ))}
              </ol>
            </Surface>
            <Surface className="relative overflow-hidden">
              <Glow tone="win" />
              <div className="relative flex flex-col gap-3 p-4">
                <h2 className="text-sm font-medium text-muted">You're owed</h2>
                <Money amount={owed.reduce((n, t) => n + t.amount, 0)} currency={currency} className="font-display text-4xl leading-none text-win" />
                <p className="text-sm text-muted">
                  {owed.map((t) => `${nameOf(t.from)} pays you`).join(", ")}
                </p>
                <Button>
                  Settle up
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              </div>
            </Surface>
          </aside>
        </div>
      </main>
    </div>
  );
}
