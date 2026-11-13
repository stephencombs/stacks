import type { SessionId, TripId } from "@stacks/contracts";
import { formatTime } from "@stacks/client-runtime/format";
import { useRecordingHome } from "@stacks/client-runtime/recordingReact";
import { visitTitle } from "@stacks/client-runtime/recordingView";
import { useAtomValue } from "@effect/atom-react";
import { useNavigation } from "@react-navigation/native";
import type * as DateTime from "effect/DateTime";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "../components/ui/Icon";
import { GlassSurface } from "../components/ui/GlassSurface";
import { useGo } from "../lib/go";
import { useStacks } from "../lib/stacks";

/** What of your table a screen already shows: the session itself, or a trip that pins it first. */
export type ShowsTable = { readonly session: SessionId } | { readonly trip: TripId };

type Placement = {
  /** Room to leave below the bar, such as a tab bar. */
  bottom?: number;
  onHeightChange?: (height: number) => void;
};

/**
 * What you're playing, pinned to the bottom of every screen in Crew that isn't showing it, so a
 * live session never goes missing: your own session first, else your seat at a group's table.
 */
export function LiveBar({ shows, ...placement }: Placement & { shows?: ShowsTable }) {
  const { home } = useRecordingHome();
  const visit = home?.active[0];
  return visit ? <YourSession {...placement} /> : <Seat shows={shows} {...placement} />;
}

/** Your own live session, for screens that read nothing from an account. */
export function PersonalLiveBar(placement: Placement) {
  const { home } = useRecordingHome();
  const visit = home?.active[0];
  const { onHeightChange } = placement;
  useEffect(() => {
    if (!visit) onHeightChange?.(0);
  }, [visit, onHeightChange]);
  return visit ? <YourSession {...placement} /> : null;
}

function YourSession(placement: Placement) {
  const navigation = useNavigation();
  const { home } = useRecordingHome();
  const visit = home!.active[0]!;
  const title = visitTitle(visit.table);
  return (
    <Bar
      {...placement}
      label={`Back to your session, ${title}, since ${formatTime(visit.visit.startedAt)}`}
      hint="Goes back to your session"
      title={title}
      since={visit.visit.startedAt}
      onPress={() => navigation.navigate("Play", { visitId: visit.visit.id })}
    />
  );
}

function Seat({ shows, ...placement }: Placement & { shows?: ShowsTable | undefined }) {
  const stacks = useStacks();
  const go = useGo();
  const groups = AsyncResult.getOrElse(useAtomValue(stacks.groups), () => []);
  const seat = groups.flatMap((item) => (item.mySession ? [item.mySession] : []))[0];
  const visible =
    seat &&
    !(shows && ("session" in shows ? shows.session === seat.id : shows.trip === seat.tripId));
  const { onHeightChange } = placement;
  useEffect(() => {
    if (!visible) onHeightChange?.(0);
  }, [visible, onHeightChange]);
  if (!visible) return null;
  return (
    <Bar
      {...placement}
      label={`Back to your table at ${seat.venueName}, since ${formatTime(seat.startedAt)}`}
      hint="Goes back to your table"
      title={seat.venueName}
      since={seat.startedAt}
      onPress={() => go.session(seat.id)}
    />
  );
}

function Bar({
  bottom,
  onHeightChange,
  label,
  hint,
  title,
  since,
  onPress,
}: Placement & {
  label: string;
  hint: string;
  title: string;
  since: DateTime.Utc;
  onPress: () => void;
}) {
  const insets = useSafeAreaInsets();
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
        accessibilityLabel={label}
        accessibilityHint={hint}
        onPress={onPress}
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
            {title}
          </Text>
          <Text className="font-mono text-xs text-muted">since {formatTime(since)}</Text>
          <Icon name="chevron-right" color="muted" size={16} />
        </GlassSurface>
      </Pressable>
    </View>
  );
}
