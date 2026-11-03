import { MinorUnits, type CurrencyCode, type PlayerResult } from "@stacks/contracts";

import { Money } from "~/components/Money";
import { Section } from "~/components/ui/Page";
import { Surface } from "~/components/ui/Surface";

type BreakdownRow = {
  readonly id: string | number;
  readonly label: string;
  readonly sessionCount: number;
  readonly results: ReadonlyArray<PlayerResult>;
};

const tableNet = (results: ReadonlyArray<PlayerResult>) =>
  MinorUnits.make(results.reduce((sum, result) => sum + result.net, 0));

/** Rows ordered by what the whole table won there, best first. */
export const byNet = <R extends { readonly results: ReadonlyArray<PlayerResult> }>(
  rows: ReadonlyArray<R>,
) => rows.toSorted((a, b) => tableNet(b.results) - tableNet(a.results));

/** The group's results split one way, by game, casino or seat: sessions and table net for each. */
export function Breakdown({
  title,
  rows,
  currency,
}: {
  title: string;
  rows: ReadonlyArray<BreakdownRow>;
  currency: CurrencyCode;
}) {
  return (
    <Section title={title}>
      <Surface className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-line text-sm text-muted">
              <th className="px-4 py-2.5 text-left font-normal">
                <span className="sr-only">{title}</span>
              </th>
              <th className="px-4 py-2.5 text-right font-normal">Sessions</th>
              <th className="px-4 py-2.5 text-right font-normal">Table net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 font-medium">{row.label}</td>
                <td className="px-4 py-3 text-right text-muted tabular-nums">{row.sessionCount}</td>
                <td className="px-4 py-3 text-right font-semibold">
                  <Money amount={tableNet(row.results)} currency={currency} tone="result" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Surface>
    </Section>
  );
}
