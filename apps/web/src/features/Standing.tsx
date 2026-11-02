import type { CurrencyCode } from "@stacks/contracts";
import type { ReactNode, Ref } from "react";

import { Money } from "~/components/Money";
import { Row, RowText } from "~/components/ui/Surface";
import { Chip } from "./Chip";

/** One player's place on a board: rank, chip, name and result. No `net` is no result yet. */
export function Standing({
  rowRef,
  rank,
  chip,
  name,
  meta,
  net,
  currency,
}: {
  rowRef: Ref<HTMLLIElement>;
  rank: number;
  chip: number;
  name: ReactNode;
  meta?: ReactNode;
  net: number | null;
  currency: CurrencyCode;
}) {
  return (
    <li ref={rowRef} className="relative bg-surface">
      <Row>
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
    </li>
  );
}
