import { View } from "react-native";

import { List, Row, Skeleton } from "./Surface";

const rows = [
  ["w-44", "w-56"],
  ["w-36", "w-48"],
  ["w-52", "w-40"],
  ["w-40", "w-52"],
  ["w-48", "w-44"],
  ["w-32", "w-56"],
  ["w-44", "w-36"],
  ["w-56", "w-48"],
] as const;

/**
 * Placeholder for a picker's rows, with the geometry of `List` rows that carry a `type-heading`
 * title over a `type-footnote` detail, so the real rows swap in without shifting anything.
 */
export function PickerRowsSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading" accessibilityRole="progressbar">
      <List>
        {rows.map(([title, detail]) => (
          <Row key={`${title}-${detail}`} className="py-4">
            <View className="min-w-0 flex-1 gap-0.5">
              <View className="h-[22px] justify-center">
                <Skeleton className={`h-4 ${title}`} />
              </View>
              <View className="h-[18px] justify-center">
                <Skeleton className={`h-3 ${detail}`} />
              </View>
            </View>
          </Row>
        ))}
      </List>
    </View>
  );
}
