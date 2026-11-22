import { ActivityIndicator, View } from "react-native";

import { Icon } from "./Icon";
import { List, Row } from "./Surface";
import { Text } from "./Text";

export type PickerRow = {
  readonly key: string;
  readonly title: string;
  readonly detail: string;
  readonly selected: boolean;
};

/** The rows of a `SearchablePickerSheet`: a check on the chosen one, a spinner on the one saving. */
export function PickerRows<T extends PickerRow>({
  options,
  pendingKey,
  onChoose,
}: {
  options: ReadonlyArray<T>;
  pendingKey: string | null;
  onChoose: (option: T) => void;
}) {
  return (
    <List>
      {options.map((option) => {
        const busy = pendingKey === option.key;

        return (
          <Row
            key={option.key}
            accessibilityLabel={option.title}
            accessibilityState={{ selected: option.selected, busy }}
            onPress={() => onChoose(option)}
            className="py-4"
          >
            <View className="min-w-0 flex-1 gap-0.5">
              <Text numberOfLines={2} className="type-heading text-ink">
                {option.title}
              </Text>
              {option.detail ? (
                <Text numberOfLines={1} className="type-footnote text-muted">
                  {option.detail}
                </Text>
              ) : null}
            </View>
            {busy ? (
              <ActivityIndicator size="small" />
            ) : option.selected ? (
              <Icon name="check" color="ink" size={18} />
            ) : null}
          </Row>
        );
      })}
    </List>
  );
}
