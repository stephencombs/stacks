import { createFileRoute } from "@tanstack/react-router";
import { runningLine } from "@stacks/client-runtime/chart";
import { useRecordingHome } from "@stacks/client-runtime/recordingReact";
import { RECORDING_CURRENCY } from "@stacks/client-runtime/recordingView";
import {
  personalStatsView,
  TOP_CASINOS,
  type GameChip,
  type PersonalStatsView,
  type StatsFilters,
} from "@stacks/client-runtime/stats";
import { MinorUnits } from "@stacks/contracts";
import { formatMoney } from "@stacks/shared/money";
import { ChartColumn, ChevronRight } from "lucide-react";
import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";

import { Money } from "~/components/Money";
import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { FilterChip } from "~/components/ui/Menu";
import { Section } from "~/components/ui/Page";
import { List, Row, RowButton, RowText, Skeleton, Surface } from "~/components/ui/Surface";
import { cn } from "~/components/ui/cn";
import { SaveStatus } from "~/features/Personal";
import { PastSessionDialog } from "~/features/RecordingForms";
import { useWidth } from "~/lib/useWidth";

export const Route = createFileRoute("/stats")({ component: Stats });

type Shown = Exclude<PersonalStatsView, { kind: "empty" }>;
type Summary = Extract<PersonalStatsView, { kind: "stats" }>;

const chipColor: Record<GameChip, string> = {
  red: "bg-chip-red",
  blue: "bg-chip-blue",
  green: "bg-chip-green",
  black: "bg-chip-black",
  purple: "bg-chip-purple",
  orange: "bg-chip-orange",
  grey: "bg-chip-grey",
};

const signed = (amount: number) =>
  formatMoney(MinorUnits.make(amount), RECORDING_CURRENCY, { signDisplay: "exceptZero" });

/** Your own play, broken down, from this device's sessions: it works signed out and offline. */
function Stats() {
  const { home, status, error, retryLoad } = useRecordingHome();
  const [filters, setFilters] = useState<StatsFilters>({});
  const [adding, setAdding] = useState(false);
  const view = useMemo(
    () => (home ? personalStatsView([...home.active, ...home.finished], filters) : null),
    [home, filters],
  );
  return (
    <>
      <title>Stats · Color Up</title>
      <h1 className="sr-only">Stats</h1>
      {status === "load_failed" ? (
        <SaveStatus status={status} error={error} onRetry={retryLoad} />
      ) : null}
      {view === null ? (
        status === "load_failed" ? null : (
          <div aria-hidden className="flex flex-col gap-6">
            <div className="flex gap-2">
              <Skeleton className="h-11 w-24 rounded-full" />
              <Skeleton className="h-11 w-28 rounded-full" />
              <Skeleton className="h-11 w-32 rounded-full" />
            </div>
            <Skeleton className="h-72 w-full rounded-xl" />
          </div>
        )
      ) : view.kind === "empty" ? (
        <Centered
          title="Your stats start here"
          body="Add a finished session to see your result, hours and games here."
          action={
            <Button variant="primary" size="lg" onClick={() => setAdding(true)}>
              Add a past session
            </Button>
          }
          note="No account or internet connection needed. Your sessions are saved on this device."
        />
      ) : (
        <div className="flex flex-col gap-6">
          <Filters view={view} onChange={setFilters} />
          {view.kind === "no_match" ? (
            <Centered
              title="No matching sessions"
              body={view.sentence}
              action={
                <Button variant="primary" size="lg" onClick={() => setFilters({})}>
                  Reset all filters
                </Button>
              }
            />
          ) : (
            <Breakdown view={view} onFilter={setFilters} />
          )}
        </div>
      )}
      {adding ? (
        <PastSessionDialog onClose={() => setAdding(false)} onAdded={() => setAdding(false)} />
      ) : null}
    </>
  );
}

function Filters({ view, onChange }: { view: Shown; onChange: (filters: StatsFilters) => void }) {
  return (
    <div
      role="group"
      aria-label="Stats filters"
      className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] lg:mx-0 lg:px-0"
    >
      {view.chips.map((chip) => (
        <FilterChip
          key={chip.key}
          name={chip.name}
          options={chip.options}
          value={chip.value}
          applied={chip.applied}
          onChange={(value) =>
            onChange(chip.options.find((option) => option.value === value)!.filters)
          }
          onClear={() => onChange(chip.cleared)}
        />
      ))}
      {view.filtered ? (
        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => onChange({})}>
          Reset all
        </Button>
      ) : null}
    </div>
  );
}

function Breakdown({
  view,
  onFilter,
}: {
  view: Summary;
  onFilter: (filters: StatsFilters) => void;
}) {
  const [casinos, setCasinos] = useState(false);
  return (
    <>
      <Surface className="flex flex-col p-4">
        <h2 className="text-[13px] font-semibold tracking-[0.055em] text-muted uppercase">
          {view.title}
        </h2>
        <Money
          amount={view.result}
          currency={RECORDING_CURRENCY}
          tone="result"
          className="mt-2 font-display text-5xl leading-none sm:text-6xl"
        />
        {view.chart ? (
          <RunningChart
            key={view.chart.points.map((point) => point.sessionId).join(",")}
            chart={view.chart}
          />
        ) : null}
        <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
          <Figure label="Sessions">{view.sessions}</Figure>
          <Figure label="Hours">{view.hours}</Figure>
          <Figure label="Per hour">
            <Money amount={view.hourlyResult} currency={RECORDING_CURRENCY} tone="result" />
          </Figure>
          <Figure label="Win rate" sub={view.winRateLine}>
            {view.winRate}
          </Figure>
        </dl>
      </Surface>
      {view.list ? (
        <Section
          title={view.filtered ? "Matching sessions" : "Sessions"}
          aside={`${view.list.length} finished`}
        >
          <List>
            {view.list.map((row) => (
              <Row key={row.key}>
                <span
                  aria-hidden
                  className={cn("w-1 self-stretch rounded-full", chipColor[row.chip])}
                />
                <RowText title={row.title} meta={row.meta} />
                <Money
                  amount={row.result}
                  currency={RECORDING_CURRENCY}
                  tone="result"
                  className="shrink-0 font-semibold"
                />
              </Row>
            ))}
          </List>
        </Section>
      ) : null}
      {view.byGame ? (
        <Section
          title="By game"
          aside={`${view.byGame.length} ${view.byGame.length === 1 ? "game" : "games"}`}
        >
          <List>
            {view.byGame.map((row) => (
              <RowButton
                key={row.key}
                aria-label={`${row.label}, ${row.meta}, ${signed(row.result)}. Show only ${row.label}.`}
                onClick={() => onFilter(row.filters)}
              >
                <span
                  aria-hidden
                  className={cn("size-2 shrink-0 rounded-full", chipColor[row.chip])}
                />
                <RowText title={row.label} meta={row.meta} />
                <span
                  aria-hidden
                  className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-fill"
                >
                  <span
                    className={cn(
                      "block h-full rounded-full",
                      row.result < 0 ? "bg-loss" : "bg-win",
                    )}
                    style={{ width: `${row.share * 100}%` }}
                  />
                </span>
                <Money
                  amount={row.result}
                  currency={RECORDING_CURRENCY}
                  tone="result"
                  className="min-w-18 shrink-0 text-right font-semibold"
                />
              </RowButton>
            ))}
          </List>
        </Section>
      ) : null}
      {view.byCasino ? (
        <Section
          title="By casino"
          action={
            view.byCasino.length > TOP_CASINOS ? (
              <Button variant="ghost" size="sm" onClick={() => setCasinos(true)}>
                See all
              </Button>
            ) : null
          }
        >
          <CasinoRows rows={view.byCasino.slice(0, TOP_CASINOS)} onFilter={onFilter} />
          <Dialog
            open={casinos}
            onOpenChange={setCasinos}
            title="Casinos"
            description={view.casinosLine}
          >
            <div className="flex flex-col gap-2">
              <div className="flex justify-between px-4 text-sm text-muted">
                <span>Most played first</span>
                <span>Result</span>
              </div>
              <CasinoRows
                rows={view.byCasino}
                onFilter={(filters) => {
                  setCasinos(false);
                  onFilter(filters);
                }}
              />
            </div>
          </Dialog>
        </Section>
      ) : null}
    </>
  );
}

function CasinoRows({
  rows,
  onFilter,
}: {
  rows: NonNullable<Summary["byCasino"]>;
  onFilter: (filters: StatsFilters) => void;
}) {
  return (
    <List>
      {rows.map((row) => (
        <RowButton
          key={row.key}
          aria-label={`${row.label}, ${row.meta}, ${signed(row.result)}. Show only this casino.`}
          onClick={() => onFilter(row.filters)}
        >
          <RowText title={row.label} meta={row.meta} />
          <Money
            amount={row.result}
            currency={RECORDING_CURRENCY}
            tone="result"
            className="shrink-0 font-semibold"
          />
          <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
        </RowButton>
      ))}
    </List>
  );
}

function Figure({ label, sub, children }: { label: string; sub?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs font-semibold tracking-[0.055em] text-muted uppercase">{label}</dt>
      <dd className="text-lg leading-tight font-semibold whitespace-nowrap tabular-nums">
        {children}
      </dd>
      {sub ? <dd className="text-xs text-muted">{sub}</dd> : null}
    </div>
  );
}

const HEIGHT = 64;
const PAD = { x: 6, y: 6 };
const CALLOUT = 204;

/** The running result against time, from break-even. Dragging, or the arrow keys, reads one session. */
function RunningChart({ chart }: { chart: NonNullable<Summary["chart"]> }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [inspect, setInspect] = useState<number | null>(null);
  const clip = useId().replace(/[^\w-]/g, "");
  const { points } = chart;
  const last = points.length - 1;
  const plot = runningLine(points, { width, height: HEIGHT }, PAD);
  const read = (clientX: number) =>
    setInspect(plot.nearest(clientX - box.current!.getBoundingClientRect().left));
  const keys = (event: KeyboardEvent) => {
    const from = inspect ?? last;
    const next =
      event.key === "ArrowLeft" || event.key === "ArrowDown"
        ? Math.max(0, from - 1)
        : event.key === "ArrowRight" || event.key === "ArrowUp"
          ? Math.min(last, from + 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : undefined;
    if (event.key === "Escape" && inspect !== null) setInspect(null);
    else if (next === undefined) return;
    else setInspect(next);
    event.preventDefault();
  };
  const shown = inspect === null ? null : points[inspect]!;
  const dot = plot.points[inspect ?? last];
  const total = (shown ?? points[last]!).total;
  const callout =
    dot && shown
      ? Math.min(
          Math.max(0, dot.x < width / 2 ? dot.x + 12 : dot.x - 12 - CALLOUT),
          Math.max(0, width - CALLOUT),
        )
      : 0;
  return (
    <div className="mt-3 flex flex-col">
      <div className="mb-1 flex items-center justify-between text-[13px] text-muted">
        <span>Running result</span>
        <button
          type="button"
          onClick={() => setInspect(inspect === null ? last : null)}
          className="-my-3 py-3 transition-colors duration-150 hover:text-ink"
        >
          {inspect === null ? "Drag to inspect" : "Done"}
        </button>
      </div>
      <div
        ref={box}
        role="slider"
        tabIndex={0}
        aria-label="Running result by finished session; use arrow keys to inspect"
        aria-valuemin={1}
        aria-valuemax={points.length}
        aria-valuenow={(inspect ?? last) + 1}
        aria-valuetext={
          shown
            ? `${shown.day}, session ${signed(shown.result)}, running ${signed(shown.total)}`
            : signed(total)
        }
        onKeyDown={keys}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          read(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) read(event.clientX);
        }}
        className="relative cursor-crosshair touch-none rounded-sm select-none"
        style={{ height: HEIGHT }}
      >
        {width > 0 ? (
          <svg width={width} height={HEIGHT} aria-hidden className="block overflow-visible">
            <defs>
              <clipPath id={`${clip}-up`}>
                <rect x={-8} y={-8} width={width + 16} height={plot.zero + 8} />
              </clipPath>
              <clipPath id={`${clip}-down`}>
                <rect x={-8} y={plot.zero} width={width + 16} height={HEIGHT - plot.zero + 8} />
              </clipPath>
            </defs>
            <path d={plot.area} fill="var(--color-win-tint)" clipPath={`url(#${clip}-up)`} />
            <path d={plot.area} fill="var(--color-loss-tint)" clipPath={`url(#${clip}-down)`} />
            <line
              x1={0}
              x2={width}
              y1={plot.zero}
              y2={plot.zero}
              stroke="var(--color-fill-strong)"
              strokeDasharray="3 4"
            />
            {(["up", "down"] as const).map((side) => (
              <polyline
                key={side}
                points={plot.line}
                fill="none"
                stroke={side === "up" ? "var(--color-win)" : "var(--color-loss)"}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                clipPath={`url(#${clip}-${side})`}
              />
            ))}
            <text
              x={width - 3}
              y={plot.zero - 5}
              textAnchor="end"
              stroke="var(--color-surface)"
              strokeWidth={4}
              paintOrder="stroke"
              className="fill-muted text-xs"
            >
              Even
            </text>
            {shown && dot ? (
              <line
                x1={dot.x}
                x2={dot.x}
                y1={0}
                y2={HEIGHT}
                stroke="var(--color-muted)"
                strokeDasharray="3 3"
              />
            ) : null}
            {dot ? (
              <circle
                cx={dot.x}
                cy={dot.y}
                r={4}
                fill={total < 0 ? "var(--color-loss)" : "var(--color-win)"}
                stroke="var(--color-surface)"
                strokeWidth={2}
              />
            ) : null}
          </svg>
        ) : null}
        {shown ? (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 flex flex-col gap-1 rounded-xl bg-surface px-3 py-2 shadow-(--elevation-popover)"
            style={{ left: callout, width: CALLOUT }}
          >
            <span className="text-[13px] font-semibold">{shown.day}</span>
            <span className="flex justify-between gap-3 text-xs text-muted">
              Running
              <Money
                amount={shown.total}
                currency={RECORDING_CURRENCY}
                tone="result"
                className="font-semibold"
              />
            </span>
            <span className="flex justify-between gap-3 text-xs text-muted">
              That session
              <Money
                amount={shown.result}
                currency={RECORDING_CURRENCY}
                tone="result"
                className="font-semibold"
              />
            </span>
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted">
        <span>{chart.from}</span>
        <span>{chart.to}</span>
      </div>
    </div>
  );
}

function Centered({
  title,
  body,
  action,
  note,
}: {
  title: string;
  body: string;
  action: ReactNode;
  note?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-6 px-4 py-16 text-center">
      <ChartColumn className="size-10 text-muted" aria-hidden />
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold tracking-[-0.025em] text-balance">{title}</h2>
        <p className="max-w-[65ch] text-pretty text-muted">{body}</p>
      </div>
      {action}
      {note ? <p className="max-w-[65ch] text-[13px] text-pretty text-muted">{note}</p> : null}
    </div>
  );
}
