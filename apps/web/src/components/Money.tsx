import { MinorUnits, type CurrencyCode } from "@stacks/contracts";
import { formatMoney } from "@stacks/shared/money";

import { cn } from "./ui/cn";

/**
 * An amount in the group's currency. `result` colors wins and losses and always shows the sign,
 * so the number reads correctly without the color.
 */
export function Money({
  amount,
  currency,
  tone = "plain",
  className,
}: {
  amount: MinorUnits;
  currency: CurrencyCode;
  tone?: "plain" | "result";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        tone === "result" && amount > 0 && "text-win",
        tone === "result" && amount < 0 && "text-loss",
        tone === "result" && amount === 0 && "text-muted",
        className,
      )}
    >
      {formatMoney(amount, currency, { signDisplay: tone === "result" ? "exceptZero" : "auto" })}
    </span>
  );
}

/** "Owed $40", "Owes $40" or "Square", for a balance. */
export function BalanceLabel({
  amount,
  currency,
  subject = "third",
}: {
  amount: MinorUnits;
  currency: CurrencyCode;
  subject?: "you" | "third";
}) {
  if (amount === 0) return <span className="text-muted">Square</span>;
  const magnitude = MinorUnits.make(Math.abs(amount));
  const verb =
    amount > 0
      ? subject === "you"
        ? "You're owed"
        : "Owed"
      : subject === "you"
        ? "You owe"
        : "Owes";
  return (
    <span className={amount > 0 ? "text-win" : "text-loss"}>
      {verb} <Money amount={magnitude} currency={currency} />
    </span>
  );
}
