import { Host } from "@expo/ui";
import { Row, Text, ToggleButton } from "@expo/ui/jetpack-compose";
import * as composeModifiers from "@expo/ui/jetpack-compose/modifiers";
import {
  background,
  clip,
  defaultMinSize,
  fillMaxWidth,
  weight,
} from "@expo/ui/jetpack-compose/modifiers";
import { useCSSVariable, useUniwind } from "uniwind";

import type { SegmentedControlProps } from "./SegmentedControl";

const ROUND = 100;
const INNER = 8;
const CLEAR = "#00000000";

export function SegmentedControl<A extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<A>) {
  const { theme } = useUniwind();

  const [ink = "", inkInverse = "", fill = ""] = useCSSVariable([
    "--color-ink",
    "--color-ink-inverse",
    "--color-fill",
  ]).map(String);

  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={theme === "dark" ? "dark" : "light"}
      seedColor={ink}
    >
      <Row horizontalArrangement={{ spacedBy: 2 }} modifiers={[fillMaxWidth()]}>
        {options.map((option, index) => {
          const selected = option.value === value;
          const start = selected || index === 0 ? ROUND : INNER;
          const end = selected || index === options.length - 1 ? ROUND : INNER;

          return (
            <ToggleButton
              key={option.value}
              checked={selected}
              onCheckedChange={() => onChange(option.value)}
              colors={{
                containerColor: CLEAR,
                checkedContainerColor: CLEAR,
                contentColor: ink,
                checkedContentColor: inkInverse,
              }}
              modifiers={[
                weight(1),
                defaultMinSize({ minHeight: 48 }),
                clip(
                  composeModifiers.Shapes.RoundedCorner({
                    topStart: start,
                    bottomStart: start,
                    topEnd: end,
                    bottomEnd: end,
                  }),
                ),
                background(selected ? ink : fill),
              ]}
            >
              <Text maxLines={1} style={{ fontWeight: "600" }}>
                {selected ? `✓ ${option.label}` : option.label}
              </Text>
            </ToggleButton>
          );
        })}
      </Row>
    </Host>
  );
}
