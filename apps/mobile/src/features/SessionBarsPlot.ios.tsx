import { Chart, Host } from "@expo/ui/swift-ui";
import { frame } from "@expo/ui/swift-ui/modifiers";
import type { CurrencyCode } from "@stacks/contracts";
import { minorUnitDigits } from "@stacks/shared/money";
import { useCSSVariable } from "uniwind";

const HEIGHT = 160;

/** Swift Charts on iOS. Values are in whole currency units so the axis reads naturally. */
export function SessionBarsPlot({
  points,
  currency,
}: {
  points: ReadonlyArray<{ readonly id: string; readonly net: number }>;
  currency: CurrencyCode;
}) {
  const [win, loss, rule] = useCSSVariable(["--color-win", "--color-loss", "--color-line-strong"]);
  const scale = 10 ** minorUnitDigits(currency);
  const data = points.map((point, index) => ({
    x: index + 1,
    y: point.net / scale,
    color: String(point.net < 0 ? loss : win),
  }));

  return (
    <Host style={{ height: HEIGHT, width: "100%" }}>
      <Chart
        type="bar"
        data={data}
        barStyle={{ cornerRadius: 2 }}
        referenceLines={[{ x: 0, y: 0 }]}
        ruleStyle={{ color: String(rule), lineWidth: 1 }}
        animate
        showGrid
        modifiers={[frame({ height: HEIGHT })]}
      />
    </Host>
  );
}
