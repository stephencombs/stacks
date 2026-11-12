import type { SessionId, TripId } from "@stacks/contracts";
import { formatTime } from "@stacks/client-runtime/format";
import { useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { use, useCallback, useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LiveAccessoryContext } from "../lib/liveAccessory";

import { Icon } from "../components/ui/Icon";
import { GlassSurface } from "../components/ui/GlassSurface";
import { useGo } from "../lib/go";
import { useStacks } from "../lib/stacks";
import { useScope } from "../lib/scope";

/** What of your table a screen already shows: the session itself, or a trip that pins it first. */
export type ShowsTable = { readonly session: SessionId } | { readonly trip: TripId };

function useLiveSeat(shows?: ShowsTable) {
  const stacks = useStacks();
  const groups = AsyncResult.getOrElse(useAtomValue(stacks.groups), () => []);
  const seat = groups.flatMap((item) =>
    item.mySession
      ? [
          {
            ...item.mySession,
            tripName:
              item.trips.find((trip) => trip.id === item.mySession?.tripId)?.name ??
              item.group.name,
          },
        ]
      : [],
  )[0];
  return seat &&
    !(shows && ("session" in shows ? shows.session === seat.id : shows.trip === seat.tripId))
    ? seat
    : undefined;
}

const renderLiveAccessory = ({ placement }: { placement: "regular" | "inline" }) => (
  <LiveAccessory placement={placement} />
);

export function useLiveAccessory(shows?: ShowsTable) {
  const context = use(LiveAccessoryContext);
  const navigation = useNavigation();
  const seat = useLiveSeat(shows);
  const active = context !== null;
  const visible = seat !== undefined;
  useFocusEffect(
    useCallback(() => {
      if (!active) return;
      navigation.getParent()?.setOptions({
        bottomAccessory: visible ? renderLiveAccessory : undefined,
      });
    }, [navigation, active, visible]),
  );
}

function LiveAccessory({ placement }: { placement: "regular" | "inline" }) {
  const context = use(LiveAccessoryContext);
  const seat = useLiveSeat(context?.shows);
  const go = useGo();
  const { scope } = useScope();
  if (!context || !seat) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Back to your live table at ${seat.venueName}, ${seat.tripName}`}
      onPress={() => go.session(seat.id)}
      className="min-h-11 flex-row items-center gap-2 px-4"
    >
      <View className="size-2 rounded-full bg-live" />
      <Text className="type-label text-live">Live</Text>
      <Text numberOfLines={1} className="flex-1 text-base font-medium text-ink">
        {seat.venueName}
        {scope?.trip?.id !== seat.tripId ? ` · ${seat.tripName}` : ""}
      </Text>
      {placement === "regular" ? <Icon name="chevron-right" color="muted" size={16} /> : null}
    </Pressable>
  );
}

/**
 * The table you're seated at, pinned to the bottom of every screen that isn't showing it, so a
 * live session never goes missing. Tapping it goes back to the table.
 */
export function LiveBar({
  shows,
  bottom,
  onHeightChange,
}: {
  shows?: ShowsTable;
  /** Room to leave below the bar, such as a tab bar. */
  bottom?: number;
  onHeightChange?: (height: number) => void;
}) {
  const go = useGo();
  const { scope } = useScope();
  const insets = useSafeAreaInsets();
  const context = use(LiveAccessoryContext);
  const seat = useLiveSeat(shows);
  const visible = seat && !context;
  useEffect(() => {
    if (!visible) onHeightChange?.(0);
  }, [visible, onHeightChange]);
  if (!visible) return null;
  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 px-5"
      onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
      style={
        bottom === undefined
          ? { bottom: 0, paddingBottom: Math.max(insets.bottom, 12) }
          : { bottom: bottom + 8 }
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Back to your table at ${seat.venueName}, ${seat.tripName}, since ${formatTime(seat.startedAt)}`}
        accessibilityHint="Goes back to your table"
        onPress={() => go.session(seat.id)}
        className="active:scale-[0.98]"
      >
        <GlassSurface
          radius={20}
          className="min-h-13 flex-row items-center gap-3 rounded-2xl px-4 py-3"
          fallbackClassName="border border-line-strong bg-surface shadow-md"
        >
          <View className="size-2 rounded-full bg-live" />
          <Text className="type-label text-live">Live</Text>
          <Text numberOfLines={1} className="flex-1 text-base font-medium text-ink">
            {seat.venueName}
            {scope?.trip?.id !== seat.tripId ? ` · ${seat.tripName}` : ""}
          </Text>
          <Text className="font-mono text-xs text-muted">since {formatTime(seat.startedAt)}</Text>
          <Icon name="chevron-right" color="muted" size={16} />
        </GlassSurface>
      </Pressable>
    </View>
  );
}
