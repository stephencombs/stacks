import { Chart, Host } from "@expo/ui/swift-ui";
import { frame } from "@expo/ui/swift-ui/modifiers";
import type { CurrencyCode } from "@stacks/contracts";
import { minorUnitDigits } from "@stacks/shared/money";
import { useCSSVariable } from "uniwind";

const HEIGHT = 192;

/** Swift Charts on iOS. Values are in whole currency units so the axis reads naturally. */
export function NetChartPlot({
  points,
  currency,
}: {
  points: ReadonlyArray<{ readonly id: string; readonly total: number }>;
  currency: CurrencyCode;
}) {
  const [win, loss, rule] = useCSSVariable(["--color-win", "--color-loss", "--color-line-strong"]);
  const scale = 10 ** minorUnitDigits(currency);
  const color = String((points.at(-1)?.total ?? 0) < 0 ? loss : win);
  // The line starts at zero, before the first session.
  const data = [0, ...points.map((point) => point.total)].map((total, index) => ({
    x: index,
    y: total / scale,
  }));

  return (
    <Host style={{ height: HEIGHT, width: "100%" }}>
      <Chart
        type="line"
        data={data}
        lineStyle={{ color, width: 2 }}
        referenceLines={[{ x: 0, y: 0 }]}
        ruleStyle={{ color: String(rule), lineWidth: 1 }}
        animate
        showGrid
        modifiers={[frame({ height: HEIGHT })]}
      />
    </Host>
  );
}
