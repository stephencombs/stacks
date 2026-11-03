// Ledger: the trip as one sheet, every session against every player, the way a ledger is read.
import { localClock } from "@stacks/client-runtime/trip";
import { playerTrip, tripStandings, tripNights } from "@stacks/shared/trips";
import { formatDay } from "@stacks/client-runtime/format";
import { Fragment } from "react";

import { Money } from "~/components/Money";
import { Surface, Tag } from "~/components/ui/Surface";
import { Chip } from "~/features/Chip";
import { chipIndex, closed, currency, live, me, players, trip } from "./sample";
import { AppBar, game, StartSession, TabRow, TripTitle } from "./shared";

export function Ledger() {
  const mine = playerTrip(closed as never, me as never);
  const rank = tripStandings(closed as never, localClock).find((s) => s.playerId === me)?.rank;
  const balance = trip.balances.find((b) => b.playerId === me)!.amount;
  const columns = [players.find((p) => p.id === me)!, ...players.filter((p) => p.id !== me)];
  const nights = tripNights(closed as never, localClock);
  const total = (id: string) => closed.reduce((n, s) => n + (s.results.find((r) => r.playerId === id)?.net ?? 0), 0);
  const tile = "flex flex-col gap-1 px-5 py-4";
  return (
    <div className="min-h-dvh pb-28">
      <AppBar />
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-8 pt-2">
        <header className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-4">
            <TripTitle />
            <StartSession />
          </div>
          <TabRow />
        </header>
        <Surface>
          <dl className="grid grid-cols-4 divide-x divide-line">
            <div className={tile}>
              <dt className="text-sm text-muted">Your trip</dt>
              <dd><Money amount={mine.net} currency={currency} tone="result" className="font-display text-4xl leading-none" /></dd>
            </div>
            <div className={tile}>
              <dt className="text-sm text-muted">Win rate</dt>
              <dd className="text-2xl font-semibold tabular-nums">{Math.round((mine.won / mine.played) * 100)}%</dd>
            </div>
            <div className={tile}>
              <dt className="text-sm text-muted">Board</dt>
              <dd className="text-2xl font-semibold">{rank === 1 ? "1st" : `${rank}th`} <span className="font-normal text-muted">of {players.length}</span></dd>
            </div>
            <div className={tile}>
              <dt className="text-sm text-muted">{balance >= 0 ? "You're owed" : "You owe"}</dt>
              <dd><Money amount={Math.abs(balance)} currency={currency} className={`text-2xl font-semibold ${balance >= 0 ? "text-win" : "text-loss"}`} /></dd>
            </div>
          </dl>
        </Surface>
        <Surface className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-separate border-spacing-0 text-right">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-line bg-surface px-4 py-3 text-left text-sm font-normal text-muted">Session</th>
                {columns.map((p) => (
                  <th key={p.id} title={p.displayName} className={`border-b border-line px-4 py-3 font-normal ${p.id === me ? "bg-accent/8" : ""}`}>
                    <span className="flex items-center justify-end gap-2">
                      <Chip chip={chipIndex(p.id)} name={p.displayName} size={22} />
                      <span className={`max-w-[11ch] truncate text-sm ${p.id === me ? "font-semibold text-accent-text" : "font-medium"}`}>
                        {p.id === me ? "You" : p.displayName}
                      </span>
                    </span>
                  </th>
                ))}
                <th className="border-b border-line px-4 py-3 text-sm font-normal text-muted">Table in</th>
              </tr>
            </thead>
            <tbody>
              <tr className="group cursor-pointer">
                <td className="sticky left-0 z-10 border-b border-line bg-surface px-4 py-3 text-left [@media(hover:hover)]:group-hover:bg-sunken">
                  <div className="flex items-center gap-2"><span className="font-medium">{live.venue.name}</span><Tag tone="live">Live</Tag></div>
                  <div className="text-sm text-muted">{game(live)} · in play</div>
                </td>
                {columns.map((p) => {
                  const r = live.results.find((x) => x.playerId === p.id);
                  return (
                    <td key={p.id} className={`border-b border-line px-4 py-3 text-sm [@media(hover:hover)]:group-hover:bg-sunken ${p.id === me ? "bg-accent/8" : ""}`}>
                      {r ? <span className="text-accent-text">in <Money amount={r.buyIn} currency={currency} /></span> : <span className="text-faint">–</span>}
                    </td>
                  );
                })}
                <td className="border-b border-line px-4 py-3 text-muted [@media(hover:hover)]:group-hover:bg-sunken"><Money amount={live.results.reduce((n, r) => n + r.buyIn, 0)} currency={currency} /></td>
              </tr>
              {nights.toReversed().map((night) => (
                <Fragment key={night.key}>
                  <tr>
                    <td colSpan={columns.length + 2} className="sticky left-0 border-b border-line bg-sunken px-4 py-2 text-left text-sm text-muted">
                      Night {night.number} · {formatDay((night.sessions[0] as (typeof closed)[number]).session.startedAt)}
                    </td>
                  </tr>
                  {(night.sessions as typeof closed).toReversed().map((s) => (
                    <tr key={s.session.id} className="group cursor-pointer">
                      <td className="sticky left-0 z-10 max-w-[260px] border-b border-line bg-surface px-4 py-3 text-left [@media(hover:hover)]:group-hover:bg-sunken">
                        <div className="truncate font-medium" title={s.venue.name}>{s.venue.name}</div>
                        <div className="text-sm text-muted">{game(s)}</div>
                      </td>
                      {columns.map((p) => {
                        const r = s.results.find((x) => x.playerId === p.id);
                        return (
                          <td key={p.id} className={`border-b border-line px-4 py-3 font-medium [@media(hover:hover)]:group-hover:bg-sunken ${p.id === me ? "bg-accent/8" : ""}`}>
                            {r ? <Money amount={r.net} currency={currency} tone="result" /> : <span className="text-faint">–</span>}
                          </td>
                        );
                      })}
                      <td className="border-b border-line px-4 py-3 text-muted [@media(hover:hover)]:group-hover:bg-sunken"><Money amount={s.results.reduce((n, r) => n + r.buyIn, 0)} currency={currency} /></td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="sticky left-0 z-10 bg-surface px-4 py-4 text-left font-semibold">Trip total</td>
                {columns.map((p) => (
                  <td key={p.id} className={`px-4 py-4 text-lg font-semibold ${p.id === me ? "bg-accent/8" : ""}`}>
                    <Money amount={total(p.id)} currency={currency} tone="result" />
                  </td>
                ))}
                <td className="px-4 py-4" />
              </tr>
            </tfoot>
          </table>
        </Surface>
      </main>
    </div>
  );
}
