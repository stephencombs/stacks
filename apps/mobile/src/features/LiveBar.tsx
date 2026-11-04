import type { SessionId, TripId } from "@stacks/contracts";
import { formatTime } from "@stacks/client-runtime/format";
import { useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "../components/ui/Icon";
import { useGo } from "../lib/go";
import { useStacks } from "../lib/stacks";

/** What of your table a screen already shows: the session itself, or a trip that pins it first. */
export type ShowsTable = { readonly session: SessionId } | { readonly trip: TripId };

/**
 * The table you're seated at, pinned to the bottom of every screen that isn't showing it, so a
 * live session never goes missing. Tapping it goes back to the table.
 */
export function LiveBar({
  shows,
  bottom,
}: {
  shows?: ShowsTable;
  /** Room to leave below the bar, such as a tab bar. */
  bottom?: number;
}) {
  const stacks = useStacks();
  const go = useGo();
  const insets = useSafeAreaInsets();
  const groups = AsyncResult.getOrElse(useAtomValue(stacks.groups), () => []);
  const seat = groups.flatMap((item) => (item.mySession ? [item.mySession] : []))[0];
  if (!seat) return null;
  if (shows && ("session" in shows ? shows.session === seat.id : shows.trip === seat.tripId))
    return null;
  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 px-3"
      style={
        bottom === undefined
          ? { bottom: 0, paddingBottom: Math.max(insets.bottom, 12) }
          : { bottom: bottom + 8 }
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Back to your table at ${seat.venueName}, since ${formatTime(seat.startedAt)}`}
        accessibilityHint="Goes back to your table"
        onPress={() => go.session(seat.id)}
        className="min-h-13 flex-row items-center gap-3 rounded-xl border border-line-strong bg-surface px-4 py-3 active:bg-sunken"
      >
        <View className="size-2 rounded-full bg-live" />
        <Text className="type-label text-live">Live</Text>
        <Text numberOfLines={1} className="flex-1 text-base font-medium text-ink">
          {seat.venueName}
        </Text>
        <Text className="font-mono text-xs text-muted">since {formatTime(seat.startedAt)}</Text>
        <Icon name="chevron-right" color="muted" size={16} />
      </Pressable>
    </View>
  );
}
