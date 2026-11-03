import type { CurrencyCode } from "@stacks/contracts";
import type { ReactNode, Ref } from "react";

import { Money } from "~/components/Money";
import { cn } from "~/components/ui/cn";
import { Row, RowText } from "~/components/ui/Surface";
import { Chip } from "./Chip";

/**
 * One player's place on a board: rank, chip, name and result. No `net` is no result yet. With
 * `onPick` the row is a button that picks the player, marked in gold while picked.
 */
export function Standing({
  rowRef,
  rank,
  chip,
  name,
  meta,
  net,
  currency,
  picked = false,
  onPick,
}: {
  rowRef: Ref<HTMLLIElement>;
  rank: number;
  chip: number;
  name: ReactNode;
  meta?: ReactNode;
  net: number | null;
  currency: CurrencyCode;
  picked?: boolean;
  onPick?: () => void;
}) {
  const row = (
    <Row as="span">
      <span className="w-4 shrink-0 text-center font-medium text-muted tabular-nums">{rank}</span>
      <Chip chip={chip} name={typeof name === "string" ? name : ""} size={28} />
      <RowText title={name} meta={meta} />
      {net === null ? (
        <span className="text-faint" aria-label="No result yet">
          —
        </span>
      ) : (
        <Money amount={net} currency={currency} tone="result" className="font-semibold" />
      )}
    </Row>
  );
  return (
    <li ref={rowRef} className="relative bg-surface">
      {onPick ? (
        <button
          type="button"
          aria-pressed={picked}
          onClick={onPick}
          className={cn(
            "block w-full text-left transition-colors duration-150 hover:bg-sunken focus-visible:-outline-offset-2",
            picked && "shadow-[inset_3px_0_0_var(--color-accent)]",
          )}
        >
          {row}
        </button>
      ) : (
        row
      )}
    </li>
  );
}
