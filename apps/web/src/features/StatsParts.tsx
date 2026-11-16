import {
  TOP_CASINOS,
  type GameChip,
  type StatsChip,
  type StatsFilters,
} from "@stacks/client-runtime/stats";
import { MinorUnits, type CurrencyCode } from "@stacks/contracts";
import { formatMoney } from "@stacks/shared/money";
import { ChartColumn, ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Money } from "~/components/Money";
import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { FilterChip } from "~/components/ui/Menu";
import { Section } from "~/components/ui/Page";
import { List, RowButton, RowText } from "~/components/ui/Surface";
import { cn } from "~/components/ui/cn";

export const chipColor: Record<GameChip, string> = {
  red: "bg-chip-red",
  blue: "bg-chip-blue",
  green: "bg-chip-green",
  black: "bg-chip-black",
  purple: "bg-chip-purple",
  orange: "bg-chip-orange",
  grey: "bg-chip-grey",
};

export const signed = (amount: number, currency: CurrencyCode) =>
  formatMoney(MinorUnits.make(amount), currency, { signDisplay: "exceptZero" });

/** The row of filter chips, led by `lead` (the Group chip), ending in Reset all once any applies. */
export function Filters({
  lead,
  chips,
  filtered,
  onChange,
}: {
  lead?: ReactNode;
  chips: ReadonlyArray<StatsChip>;
  filtered: boolean;
  onChange: (filters: StatsFilters) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Stats filters"
      className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] lg:mx-0 lg:px-0"
    >
      {lead}
      {chips.map((chip) => (
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
      {filtered ? (
        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => onChange({})}>
          Reset all
        </Button>
      ) : null}
    </div>
  );
}

type GameRow = {
  readonly key: string;
  readonly label: string;
  readonly meta: string;
  readonly chip: GameChip;
  readonly result: MinorUnits;
  readonly share: number;
  readonly filters: StatsFilters;
};

/** Results by game, each row narrowing the page to that game. */
export function ByGame({
  rows,
  currency,
  onFilter,
}: {
  rows: ReadonlyArray<GameRow>;
  currency: CurrencyCode;
  onFilter: (filters: StatsFilters) => void;
}) {
  return (
    <Section title="By game" aside={`${rows.length} ${rows.length === 1 ? "game" : "games"}`}>
      <List>
        {rows.map((row) => (
          <RowButton
            key={row.key}
            aria-label={`${row.label}, ${row.meta}, ${signed(row.result, currency)}. Show only ${row.label}.`}
            onClick={() => onFilter(row.filters)}
          >
            <span aria-hidden className={cn("size-2 shrink-0 rounded-full", chipColor[row.chip])} />
            <RowText title={row.label} meta={row.meta} />
            <span aria-hidden className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-fill">
              <span
                className={cn("block h-full rounded-full", row.result < 0 ? "bg-loss" : "bg-win")}
                style={{ width: `${row.share * 100}%` }}
              />
            </span>
            <Money
              amount={row.result}
              currency={currency}
              tone="result"
              className="min-w-18 shrink-0 text-right font-semibold"
            />
          </RowButton>
        ))}
      </List>
    </Section>
  );
}

type CasinoRow = {
  readonly key: string;
  readonly label: string;
  readonly meta: string;
  readonly result: MinorUnits;
  readonly filters: StatsFilters;
};

/** Results by casino, most played first, the top few here and the rest behind See all. */
export function ByCasino({
  rows,
  currency,
  line,
  onFilter,
}: {
  rows: ReadonlyArray<CasinoRow>;
  currency: CurrencyCode;
  /** What See all covers: "All time · 12 finished sessions". */
  line: string;
  onFilter: (filters: StatsFilters) => void;
}) {
  const [all, setAll] = useState(false);
  return (
    <Section
      title="By casino"
      action={
        rows.length > TOP_CASINOS ? (
          <Button variant="ghost" size="sm" onClick={() => setAll(true)}>
            See all
          </Button>
        ) : null
      }
    >
      <CasinoRows rows={rows.slice(0, TOP_CASINOS)} currency={currency} onFilter={onFilter} />
      <Dialog open={all} onOpenChange={setAll} title="Casinos" description={line}>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between px-4 text-sm text-muted">
            <span>Most played first</span>
            <span>Result</span>
          </div>
          <CasinoRows
            rows={rows}
            currency={currency}
            onFilter={(filters) => {
              setAll(false);
              onFilter(filters);
            }}
          />
        </div>
      </Dialog>
    </Section>
  );
}

function CasinoRows({
  rows,
  currency,
  onFilter,
}: {
  rows: ReadonlyArray<CasinoRow>;
  currency: CurrencyCode;
  onFilter: (filters: StatsFilters) => void;
}) {
  return (
    <List>
      {rows.map((row) => (
        <RowButton
          key={row.key}
          aria-label={`${row.label}, ${row.meta}, ${signed(row.result, currency)}. Show only this casino.`}
          onClick={() => onFilter(row.filters)}
        >
          <RowText title={row.label} meta={row.meta} />
          <Money
            amount={row.result}
            currency={currency}
            tone="result"
            className="shrink-0 font-semibold"
          />
          <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
        </RowButton>
      ))}
    </List>
  );
}

export function Figure({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: ReactNode;
}) {
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

/** A whole-page state: nothing yet, nothing matching, or nothing to show offline. */
export function Centered({
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
