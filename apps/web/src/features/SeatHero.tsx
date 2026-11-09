import type { CurrencyCode, MinorUnits } from "@stacks/contracts";
import { formatMoney } from "@stacks/shared/money";
import type { PlayerResult } from "@stacks/shared/results";
import type { ReactNode } from "react";

import { Money } from "~/components/Money";
import { Button } from "~/components/ui/Button";
import { Glow, Surface } from "~/components/ui/Surface";
import { Chip } from "./Chip";

/**
 * The seat this session is about, usually yours: what you have in, or how you finished, with the
 * next thing you'd do at the table one tap away.
 */
export function SeatHero({
  name,
  chip,
  seat,
  you,
  result,
  live,
  out,
  rebuyAmount,
  currency,
  onBuyIn,
  onRebuy,
  onCashOut,
}: {
  name: string;
  chip: number;
  seat: number | undefined;
  you: boolean;
  result: PlayerResult | undefined;
  live: boolean;
  out: boolean;
  /** The last buy-in, repeated by one tap. */
  rebuyAmount: MinorUnits | undefined;
  currency: CurrencyCode;
  onBuyIn: () => void;
  onRebuy: () => void;
  onCashOut: () => void;
}) {
  const bought = result !== undefined && result.buyIn > 0;
  const final = result !== undefined && (!live || out);
  const net = result?.net ?? 0;
  const label = [you ? "Your seat" : `${name}'s seat`, seat === undefined ? null : `seat ${seat}`]
    .filter(Boolean)
    .join(" · ");

  let figure: ReactNode;
  let line: string | null = null;
  if (final) {
    figure = <Money amount={net} currency={currency} tone="result" className={FIGURE} />;
    line = `In ${formatMoney(result.buyIn, currency)} · Out ${formatMoney(result.cashOut, currency)}`;
  } else if (bought) {
    figure = (
      <span className="flex items-baseline gap-2">
        <Money amount={result.buyIn} currency={currency} className={FIGURE} />
        <span className="text-lg text-muted">in</span>
      </span>
    );
  } else {
    figure = <span className={`${FIGURE} text-muted`}>Not in yet</span>;
  }

  return (
    <Surface className="relative overflow-hidden">
      <Glow tone={final ? (net > 0 ? "win" : net < 0 ? "loss" : "accent") : "accent"} />
      <div className="relative flex flex-col p-4">
        <div className="flex items-center gap-3">
          <Chip chip={chip} name={name} size={40} />
          <div className="flex min-w-0 flex-col">
            <h2 className="text-sm font-medium text-muted">{label}</h2>
            {figure}
          </div>
        </div>
        {line ? <p className="mt-2 text-sm text-muted">{line}</p> : null}
        {live && !out ? (
          <div className="mt-4 hidden grid-cols-2 gap-3 lg:grid">
            {!bought ? (
              <Button variant="primary" size="lg" onClick={onBuyIn} className="col-span-2">
                Buy in
              </Button>
            ) : (
              <>
                {rebuyAmount !== undefined ? (
                  <Button variant="primary" size="lg" onClick={onRebuy} className="tabular-nums">
                    Rebuy {formatMoney(rebuyAmount, currency)}
                  </Button>
                ) : (
                  <Button variant="primary" size="lg" onClick={onBuyIn}>
                    Rebuy
                  </Button>
                )}
                <Button size="lg" onClick={onCashOut}>
                  Cash out
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>
    </Surface>
  );
}

const FIGURE = "font-display text-4xl leading-none tracking-[-0.01em] sm:text-5xl";

/** The table in three numbers, under its map. */
export function TableStats({
  items,
}: {
  items: ReadonlyArray<{ label: string; value: ReactNode }>;
}) {
  return (
    <Surface>
      <dl className="flex divide-x divide-line">
        {items.map((item) => (
          <div key={item.label} className="flex flex-auto flex-col gap-0.5 px-4 py-3">
            <dt className="text-sm whitespace-nowrap text-muted">{item.label}</dt>
            <dd className="text-lg font-semibold whitespace-nowrap tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
    </Surface>
  );
}
