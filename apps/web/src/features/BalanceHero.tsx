import type { CurrencyCode } from "@stacks/contracts";
import type { barTrack } from "@stacks/client-runtime/chart";
import { balanceHeadline } from "@stacks/client-runtime/trip";

import { Money } from "~/components/Money";
import { cn } from "~/components/ui/cn";
import { Glow, Surface } from "~/components/ui/Surface";

/** Your balance on settle up as the screen's one big figure. */
export function BalanceHero({
  balance,
  payments,
  currency,
}: {
  balance: number;
  payments: number;
  currency: CurrencyCode;
}) {
  const head = balanceHeadline(balance, payments);
  return (
    <Surface className="relative overflow-hidden">
      <Glow tone={head.tone} />
      <div className="relative flex flex-col gap-1 p-5">
        <h2 className="text-xs font-medium tracking-wider text-muted uppercase">{head.label}</h2>
        <Money
          amount={Math.abs(balance)}
          currency={currency}
          className={cn(
            "font-display text-6xl leading-none tracking-[-0.01em]",
            balance > 0 ? "text-win" : balance < 0 ? "text-loss" : "text-muted",
          )}
        />
        {head.line ? <p className="text-sm text-muted">{head.line}</p> : null}
      </div>
    </Surface>
  );
}

/** A balance as a bar from break-even: right and green when owed, left and red when owing. */
export function BalanceBar({
  balance,
  track,
  className,
}: {
  balance: number;
  track: ReturnType<typeof barTrack>;
  className?: string;
}) {
  const extent = track.extent(balance) * 100;
  return (
    <span aria-hidden className={cn("relative h-1.5 shrink-0 rounded-full bg-sunken", className)}>
      {balance === 0 ? null : (
        <span
          className={cn("absolute inset-y-0 rounded-full", balance > 0 ? "bg-win" : "bg-loss")}
          style={{
            left: `${balance > 0 ? track.zero * 100 : track.zero * 100 - extent}%`,
            width: `${extent}%`,
          }}
        />
      )}
    </span>
  );
}
