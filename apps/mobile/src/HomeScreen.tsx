import { useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { Text, View } from "react-native";

import { Stacks } from "./api";

const healthAtom = Stacks.query("health", "health", {});

export function HomeScreen() {
  const health = useAtomValue(healthAtom);
  const status = AsyncResult.match(health, {
    onInitial: () => "Checking API…",
    onFailure: () => "API unreachable",
    onSuccess: () => "API connected",
  });

  return (
    <View className="flex-1 justify-center gap-3 bg-surface px-4">
      <Text className="text-3xl font-semibold text-ink">Stacks</Text>
      <Text className="text-base text-muted">
        Casino sessions and who owes whom, for your group.
      </Text>
      <Text className="text-sm text-muted" accessibilityLiveRegion="polite">
        {status}
      </Text>
    </View>
  );
}
