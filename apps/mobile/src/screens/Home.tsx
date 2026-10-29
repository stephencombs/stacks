import { useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { View } from "react-native";

import { useStacks } from "../lib/stacks";
import { GroupsScreen } from "./Groups";
import { TripHome } from "./Trip";

/** Where the app opens: the trip that's going, or your groups when none is. */
export function HomeScreen() {
  const stacks = useStacks();
  const groups = useAtomValue(stacks.groups);
  if (AsyncResult.isInitial(groups)) return <View className="flex-1 bg-canvas" />;
  const current = AsyncResult.getOrElse(groups, () => []).find((item) => item.currentTripId);
  return current?.currentTripId ? <TripHome tripId={current.currentTripId} /> : <GroupsScreen />;
}
