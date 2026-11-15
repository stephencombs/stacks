import type { SessionId, TripId } from "@stacks/contracts";
import { formatTime } from "@stacks/client-runtime/format";
import { useRecordingHome } from "@stacks/client-runtime/recordingReact";
import { visitTitle } from "@stacks/client-runtime/recordingView";
import { useAtomValue } from "@effect/atom-react";
import { useNavigation } from "@react-navigation/native";
import type * as DateTime from "effect/DateTime";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { useEffect, type ReactNode } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "../components/ui/Icon";
import { GlassSurface } from "../components/ui/GlassSurface";
import { PressableScale } from "../components/ui/PressableScale";
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
 * live session never goes missing: each of your own live sessions, else your seat at a group's
 * table.
 */
export function LiveBar({ shows, ...placement }: Placement & { shows?: ShowsTable }) {
  const { home } = useRecordingHome();
  return home?.active.length ? (
    <YourSessions {...placement} />
  ) : (
    <Seat shows={shows} {...placement} />
  );
}

/** Your own live sessions, for screens that read nothing from an account. */
export function PersonalLiveBar(placement: Placement) {
  const { home } = useRecordingHome();
  const live = (home?.active.length ?? 0) > 0;
  const { onHeightChange } = placement;
  useEffect(() => {
    if (!live) onHeightChange?.(0);
  }, [live, onHeightChange]);
  return live ? <YourSessions {...placement} /> : null;
}

function YourSessions(placement: Placement) {
  const navigation = useNavigation();
  const { home } = useRecordingHome();
  return (
    <Bars {...placement}>
      {home!.active.map((item) => {
        const title = visitTitle(item.table);
        return (
          <Bar
            key={item.visit.id}
            label={`Back to your session, ${title}, since ${formatTime(item.visit.startedAt)}`}
            hint="Goes back to your session"
            title={title}
            since={item.visit.startedAt}
            onPress={() => navigation.navigate("Play", { visitId: item.visit.id })}
          />
        );
      })}
    </Bars>
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
    <Bars {...placement}>
      <Bar
        label={`Back to your table at ${seat.venueName}, since ${formatTime(seat.startedAt)}`}
        hint="Goes back to your table"
        title={seat.venueName}
        since={seat.startedAt}
        onPress={() => go.session(seat.id)}
      />
    </Bars>
  );
}

function Bars({ bottom, onHeightChange, children }: Placement & { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 gap-2 px-5"
      onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
      style={
        bottom === undefined
          ? { bottom: 0, paddingBottom: Math.max(insets.bottom, 12) }
          : { bottom: bottom + 8 }
      }
    >
      {children}
    </View>
  );
}

function Bar({
  label,
  hint,
  title,
  since,
  onPress,
}: {
  label: string;
  hint: string;
  title: string;
  since: DateTime.Utc;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
    >
      <GlassSurface
        radius={20}
        interactive
        className="min-h-13 flex-row items-center gap-3 rounded-2xl px-4 py-3"
      >
        <View className="size-2 rounded-full bg-live" />
        <Text className="type-label text-live">Live</Text>
        <Text numberOfLines={1} className="flex-1 text-base font-medium text-ink">
          {title}
        </Text>
        <Text className="font-mono text-xs text-muted">since {formatTime(since)}</Text>
        <Icon name="chevron-right" color="muted" size={16} />
      </GlassSurface>
    </PressableScale>
  );
}
