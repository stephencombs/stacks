import {
  TOP_CASINOS,
  type GameChip,
  type StatsChip,
  type StatsFilters,
} from "@stacks/client-runtime/stats";
import { MinorUnits, type CurrencyCode } from "@stacks/contracts";
import { formatMoney } from "@stacks/shared/money";
import { useState, type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { FilterChip } from "../components/ui/FilterChip";
import { Icon } from "../components/ui/Icon";
import { Sheet } from "../components/ui/Sheet";
import { List, Row, SectionHeading } from "../components/ui/Surface";
import { cn } from "../components/ui/cn";

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
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel="Stats filters"
      className="-mx-4"
      contentContainerClassName="items-center gap-2 px-4"
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
        <Button label="Reset all" variant="ghost" size="sm" onPress={() => onChange({})} />
      ) : null}
    </ScrollView>
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
    <View className="gap-2">
      <SectionHeading>By game</SectionHeading>
      <List>
        {rows.map((row) => (
          <Row
            key={row.key}
            onPress={() => onFilter(row.filters)}
            accessibilityLabel={`${row.label}, ${row.meta}, ${signed(row.result, currency)}`}
            accessibilityHint={`Shows only ${row.label}`}
          >
            <View className={cn("size-2 rounded-full", chipColor[row.chip])} />
            <View className="min-w-0 flex-1 gap-0.5">
              <Text numberOfLines={1} className="type-heading text-ink">
                {row.label}
              </Text>
              <Text numberOfLines={1} className="type-footnote text-muted">
                {row.meta}
              </Text>
            </View>
            <View className="h-1.5 w-10 overflow-hidden rounded-full bg-fill">
              <View
                className={cn("h-full rounded-full", row.result < 0 ? "bg-loss" : "bg-win")}
                style={{ width: `${row.share * 100}%` }}
              />
            </View>
            <Money
              amount={row.result}
              currency={currency}
              tone="result"
              className="min-w-18 text-right font-semibold"
            />
          </Row>
        ))}
      </List>
    </View>
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
    <View className="gap-2">
      <SectionHeading
        action={
          rows.length > TOP_CASINOS ? (
            <Button label="See all" variant="ghost" size="sm" onPress={() => setAll(true)} />
          ) : undefined
        }
      >
        By casino
      </SectionHeading>
      <CasinoRows rows={rows.slice(0, TOP_CASINOS)} currency={currency} onFilter={onFilter} />
      {all ? (
        <Sheet open title="Casinos" description={line} onClose={() => setAll(false)}>
          <View className="gap-2">
            <View className="flex-row justify-between px-4">
              <Text className="type-footnote text-muted">Most played first</Text>
              <Text className="type-footnote text-muted">Result</Text>
            </View>
            <CasinoRows
              rows={rows}
              currency={currency}
              onFilter={(filters) => {
                setAll(false);
                onFilter(filters);
              }}
            />
          </View>
        </Sheet>
      ) : null}
    </View>
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
        <Row
          key={row.key}
          onPress={() => onFilter(row.filters)}
          accessibilityLabel={`${row.label}, ${row.meta}, ${signed(row.result, currency)}`}
          accessibilityHint="Shows only this casino"
        >
          <View className="min-w-0 flex-1 gap-0.5">
            <Text numberOfLines={1} className="type-heading text-ink">
              {row.label}
            </Text>
            <Text className="type-footnote text-muted">{row.meta}</Text>
          </View>
          <Money amount={row.result} currency={currency} tone="result" className="font-semibold" />
          <Icon name="chevron-right" color="faint" size={16} />
        </Row>
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
    <View className="w-1/2 min-w-0 gap-1 pr-2">
      <Text className="type-label text-muted">{label}</Text>
      {children}
      {sub ? <Text className="type-label text-muted">{sub}</Text> : null}
    </View>
  );
}
