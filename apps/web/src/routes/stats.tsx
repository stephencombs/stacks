import { useAtomValue } from "@effect/atom-react";
import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { runningLine } from "@stacks/client-runtime/chart";
import { groupChip } from "@stacks/client-runtime/groupStats";
import { useRecordingHome } from "@stacks/client-runtime/recordingReact";
import { RECORDING_CURRENCY } from "@stacks/client-runtime/recordingView";
import {
  personalStatsView,
  type PersonalStatsView,
  type StatsFilters,
} from "@stacks/client-runtime/stats";
import { tripNames } from "@stacks/client-runtime/trip";
import { GroupId, type GroupListItem } from "@stacks/contracts";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";

import { Money } from "~/components/Money";
import { Button } from "~/components/ui/Button";
import { FilterChip } from "~/components/ui/Menu";
import { Section, TabTitle } from "~/components/ui/Page";
import { List, Row, RowText, Skeleton, Surface } from "~/components/ui/Surface";
import { cn } from "~/components/ui/cn";
import { GroupStatsView } from "~/features/GroupStats";
import { SaveStatus } from "~/features/Personal";
import { PastSessionDialog } from "~/features/RecordingForms";
import {
  ByCasino,
  ByGame,
  Centered,
  Figure,
  Filters,
  chipColor,
  signed,
} from "~/features/StatsParts";
import { useAccount } from "~/lib/account";
import { StacksProvider, useStacks } from "~/lib/stacks";
import type { StatsPick } from "~/lib/statsPick";
import { useWidth } from "~/lib/useWidth";

export const Route = createFileRoute("/stats")({ component: Stats });

type Summary = Extract<PersonalStatsView, { kind: "stats" }>;

/**
 * Your own play, broken down, from this device's sessions: it works signed out and offline.
 * Signed in, the Group chip switches the page to one of your groups.
 */
function Stats() {
  const pick = useRouterState({ select: (state) => state.location.state.statsPick });
  // Each arrival with a group picked starts fresh, even when Stats is already open.
  const arrival = useRouterState({ select: (state) => state.location.state.__TSR_key });
  return (
    <YourGroups>
      {(groups) => <StatsView key={arrival} pick={pick ?? null} groups={groups} />}
    </YourGroups>
  );
}

const noGroups: ReadonlyArray<GroupListItem> = [];

/** Your groups when you're signed in; signed out, or before they load, there are none. */
function YourGroups({
  children,
}: {
  children: (groups: ReadonlyArray<GroupListItem>) => ReactNode;
}) {
  const account = useAccount();
  if (!account.available || !account.isSignedIn) return children(noGroups);
  return (
    <StacksProvider>
      <SignedInGroups>{children}</SignedInGroups>
    </StacksProvider>
  );
}

function SignedInGroups({
  children,
}: {
  children: (groups: ReadonlyArray<GroupListItem>) => ReactNode;
}) {
  const groups = AsyncResult.getOrElse(useAtomValue(useStacks().groups), () => noGroups);
  return children(groups);
}

function StatsView({
  pick,
  groups,
}: {
  pick: StatsPick | null;
  groups: ReadonlyArray<GroupListItem>;
}) {
  const [picked, setPicked] = useState<StatsPick | null>(pick);
  const [filters, setFilters] = useState<StatsFilters>(pick?.tripId ? { tripId: pick.tripId } : {});
  // A trip alone names its group once your groups have loaded.
  const groupId =
    picked?.groupId ??
    groups.find((item) => item.trips.some((trip) => trip.id === picked?.tripId))?.group.id ??
    null;
  const chip =
    groups.length === 0 && groupId === null ? null : (
      <GroupChip
        groups={groups}
        groupId={groupId}
        onChange={(next) => {
          setPicked(next === null ? null : { groupId: next });
          // A trip stays picked only in the group it belongs to.
          const keep =
            next === null ||
            groups.some(
              (item) =>
                item.group.id === next && item.trips.some((trip) => trip.id === filters.tripId),
            );
          if (!keep) setFilters({ ...filters, tripId: undefined });
        }}
      />
    );
  return (
    <>
      <TabTitle>Stats</TabTitle>
      {groupId === null ? (
        <JustMe names={tripNames(groups)} chip={chip} filters={filters} onFilters={setFilters} />
      ) : (
        <GroupStatsView
          key={groupId}
          groupId={groupId}
          chip={chip}
          filters={filters}
          onFilters={setFilters}
          onJustMe={() => {
            setPicked(null);
            setFilters({});
          }}
        />
      )}
    </>
  );
}

function GroupChip({
  groups,
  groupId,
  onChange,
}: {
  groups: ReadonlyArray<GroupListItem>;
  groupId: GroupId | null;
  onChange: (groupId: GroupId | null) => void;
}) {
  const chip = groupChip(
    groups.map((item) => ({ id: item.group.id, name: item.group.name })),
    groupId,
  );
  return (
    <FilterChip
      name={chip.name}
      options={chip.options}
      value={chip.value}
      applied={chip.applied}
      onChange={(value) => onChange(value === "" ? null : GroupId.make(value))}
      onClear={() => onChange(null)}
    />
  );
}

function JustMe({
  names,
  chip,
  filters,
  onFilters,
}: {
  names: ReturnType<typeof tripNames>;
  chip: ReactNode;
  filters: StatsFilters;
  onFilters: (filters: StatsFilters) => void;
}) {
  const { home, status, error, retryLoad } = useRecordingHome();
  const [adding, setAdding] = useState(false);
  const view = useMemo(
    () =>
      home
        ? personalStatsView([...home.active, ...home.finished], filters, { tripNames: names })
        : null,
    [home, filters, names],
  );
  return (
    <>
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
        <>
          {chip ? <Filters lead={chip} chips={[]} filtered={false} onChange={onFilters} /> : null}
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
        </>
      ) : (
        <div className="flex flex-col gap-6">
          <Filters lead={chip} chips={view.chips} filtered={view.filtered} onChange={onFilters} />
          {view.kind === "no_match" ? (
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
            <Breakdown view={view} onFilter={onFilters} />
          )}
        </div>
      )}
      {adding ? (
        <PastSessionDialog onClose={() => setAdding(false)} onAdded={() => setAdding(false)} />
      ) : null}
    </>
  );
}

function Breakdown({
  view,
  onFilter,
}: {
  view: Summary;
  onFilter: (filters: StatsFilters) => void;
}) {
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
        <ByGame rows={view.byGame} currency={RECORDING_CURRENCY} onFilter={onFilter} />
      ) : null}
      {view.byCasino ? (
        <ByCasino
          rows={view.byCasino}
          currency={RECORDING_CURRENCY}
          line={view.casinosLine}
          onFilter={onFilter}
        />
      ) : null}
    </>
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
            ? `${shown.day}, session ${signed(shown.result, RECORDING_CURRENCY)}, running ${signed(shown.total, RECORDING_CURRENCY)}`
            : signed(total, RECORDING_CURRENCY)
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
