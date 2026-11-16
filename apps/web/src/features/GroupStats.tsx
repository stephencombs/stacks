import { groupStatsView, type GroupStatsView as View } from "@stacks/client-runtime/groupStats";
import { savedLine } from "@stacks/client-runtime/statsCopy";
import type { StatsFilters } from "@stacks/client-runtime/stats";
import type { CurrencyCode, GroupId, PlayerId } from "@stacks/contracts";
import { useState, type ReactNode } from "react";

import { Money } from "~/components/Money";
import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { Note, Section } from "~/components/ui/Page";
import { List, Row, RowText, Skeleton } from "~/components/ui/Surface";
import { cn } from "~/components/ui/cn";
import { useGroupStats } from "~/lib/stacks";
import { Chip } from "./Chip";
import { PlayerName } from "./Player";
import { Race } from "./Race";
import { ByCasino, ByGame, Centered, Figure, Filters, signed } from "./StatsParts";

type Shown = Extract<View, { kind: "stats" }>;
type Standing = Shown["standings"][number];

/**
 * A group's stats in Stats: standings first, then everyone's running result, a trip's awards, and
 * the group's result by game and casino. Offline it shows the last copy and when it was saved.
 */
export function GroupStatsView({
  groupId,
  chip,
  filters,
  onFilters,
  onJustMe,
}: {
  groupId: GroupId;
  chip: ReactNode;
  filters: StatsFilters;
  onFilters: (filters: StatsFilters) => void;
  onJustMe: () => void;
}) {
  const state = useGroupStats(groupId);
  const justMe = (
    <Button variant="primary" size="lg" onClick={onJustMe}>
      Just me
    </Button>
  );
  if (state.kind === "loading")
    return (
      <div aria-hidden className="flex flex-col gap-6">
        <div className="flex gap-2">
          <Skeleton className="h-11 w-36 rounded-full" />
          <Skeleton className="h-11 w-28 rounded-full" />
          <Skeleton className="h-11 w-28 rounded-full" />
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  if (state.kind === "refused" || state.kind === "unavailable")
    return (
      <div className="flex flex-col gap-6">
        <Filters lead={chip} chips={[]} filtered={false} onChange={onFilters} />
        <Centered
          title={
            state.kind === "refused" ? "Can't show this group" : "Group stats need a connection"
          }
          body={
            state.kind === "refused"
              ? state.message
              : "This device hasn't saved this group's stats yet. Your own stats work offline."
          }
          action={justMe}
        />
      </div>
    );

  const { detail, stats } = state.kind === "live" ? state : state.copy;
  const view = groupStatsView(stats, detail, filters);
  return (
    <div className="flex flex-col gap-6">
      <Filters lead={chip} chips={view.chips} filtered={view.filtered} onChange={onFilters} />
      {state.kind === "saved" ? (
        <Note>{`${savedLine(state.copy.fetchedAt)}. You're offline, so this may be behind.`}</Note>
      ) : null}
      {view.kind === "empty" ? (
        <Centered
          title="No finished sessions yet"
          body={`${detail.group.name}'s stats count the finished sessions in its trips.`}
          action={justMe}
        />
      ) : view.kind === "no_match" ? (
        <Centered
          title="No matching sessions"
          body={view.sentence}
          action={
            <Button variant="primary" size="lg" onClick={() => onFilters({})}>
              Reset all filters
            </Button>
          }
        />
      ) : (
        <Shown view={view} me={detail.myPlayerId} onFilter={onFilters} />
      )}
    </div>
  );
}

function Shown({
  view,
  me,
  onFilter,
}: {
  view: Shown;
  me: PlayerId;
  onFilter: (filters: StatsFilters) => void;
}) {
  const [open, setOpen] = useState<Standing | null>(null);
  const racers = view.standings.filter((row) => row.rank !== null);
  const picked = racers.some((row) => row.playerId === me) ? me : racers[0]!.playerId;
  return (
    <>
      <Standings view={view} onOpen={setOpen} />
      {view.sessions > 1 ? (
        <Section title="Running result">
          <Race
            sessions={view.race.sessions}
            players={racers}
            currency={view.currency}
            picked={picked}
            marks={view.race.marks}
            where={(session) => session.where}
          />
        </Section>
      ) : null}
      {view.awards && view.awards.length > 0 ? (
        <Section title="Awards">
          <List>
            {view.awards.map((award) => (
              <Row key={award.key}>
                <Chip chip={award.chip} name={award.name} size={28} />
                <RowText title={award.title} meta={`${award.name} · ${award.line}`} />
              </Row>
            ))}
          </List>
        </Section>
      ) : null}
      {view.byGame ? (
        <ByGame rows={view.byGame} currency={view.currency} onFilter={onFilter} />
      ) : null}
      {view.byCasino ? (
        <ByCasino
          rows={view.byCasino}
          currency={view.currency}
          line={`${view.title} · ${view.sessions} finished ${view.sessions === 1 ? "session" : "sessions"}`}
          onFilter={onFilter}
        />
      ) : null}
      {open ? (
        <StatSheet
          row={open}
          title={view.title}
          currency={view.currency}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

/** Everyone ranked by result, you marked, the group's result under them. */
function Standings({ view, onOpen }: { view: Shown; onOpen: (row: Standing) => void }) {
  return (
    <Section title="Standings" aside={view.title}>
      <List as="ol" label="Standings">
        {view.standings.map((row) => (
          <li key={row.playerId}>
            <button
              type="button"
              onClick={() => onOpen(row)}
              aria-label={`${row.rank === null ? "Unranked" : `Rank ${row.rank}`}, ${row.name}${row.you ? " (you)" : ""}, ${row.meta}, ${signed(row.result, view.currency)}. Open their stats.`}
              className={cn(
                "block w-full text-left transition-colors duration-150 hover:bg-fill active:bg-fill focus-visible:outline-offset-[-2px]",
                row.you && "shadow-[inset_3px_0_0_var(--color-ink)]",
              )}
            >
              <Row as="span">
                <span className="w-5 shrink-0 text-center font-medium text-muted tabular-nums">
                  {row.rank ?? "–"}
                </span>
                <Chip chip={row.chip} name={row.name} size={28} />
                <RowText title={<PlayerName name={row.name} you={row.you} />} meta={row.meta} />
                <Money
                  amount={row.result}
                  currency={view.currency}
                  tone="result"
                  className="shrink-0 font-semibold"
                />
              </Row>
            </button>
          </li>
        ))}
        <li>
          <Row>
            <RowText
              title="Group result"
              meta={`${view.sessions} ${view.sessions === 1 ? "session" : "sessions"}`}
            />
            <Money
              amount={view.total}
              currency={view.currency}
              tone="result"
              className="shrink-0 font-semibold"
            />
          </Row>
        </li>
      </List>
    </Section>
  );
}

/** One member's numbers over what's shown. */
function StatSheet({
  row,
  title,
  currency,
  onClose,
}: {
  row: Standing;
  title: string;
  currency: CurrencyCode;
  onClose: () => void;
}) {
  const { sheet } = row;
  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={row.name}
      description={row.rank === null ? `${title} · No sessions` : `${title} · Rank ${row.rank}`}
    >
      <div className="flex flex-col gap-6">
        <Money
          amount={sheet.result}
          currency={currency}
          tone="result"
          className="font-display text-5xl leading-none"
        />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
          <Figure label="Sessions">{sheet.sessions}</Figure>
          <Figure label="Hours">{sheet.hours}</Figure>
          <Figure label="Per hour">
            <Money amount={sheet.hourlyResult} currency={currency} tone="result" />
          </Figure>
          <Figure label="Win rate" {...(sheet.sessions > 0 ? { sub: sheet.winRateLine } : {})}>
            {sheet.winRate}
          </Figure>
        </dl>
      </div>
    </Dialog>
  );
}
