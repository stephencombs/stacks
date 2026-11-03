// Baseline: today's Sessions tab, unchanged, in the 672px column every screen uses.
import { Section } from "~/components/ui/Page";
import { LiveSessionCard, SessionList } from "~/features/SessionList";
import { TripHero } from "~/features/TripHero";
import { closed, currency, group, live, me } from "./sample";
import { AppBar, StartSession, TabRow, TripTitle } from "./shared";

export function Current() {
  return (
    <div className="min-h-dvh pb-28">
      <AppBar wide={false} />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 pt-2">
        <header className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-4">
            <TripTitle />
            <StartSession />
          </div>
          <TabRow />
        </header>
        <TripHero currency={currency} me={me} sessions={closed} />
        <LiveSessionCard summary={live} detail={group} />
        <Section title="Past sessions">
          <SessionList sessions={closed.toReversed()} detail={group} />
        </Section>
      </main>
    </div>
  );
}
