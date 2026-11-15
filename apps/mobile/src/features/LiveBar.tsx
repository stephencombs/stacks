import type { SessionId, TripId, VisitId } from "@stacks/contracts";
import { formatTime } from "@stacks/client-runtime/format";
import { useRecordingHome } from "@stacks/client-runtime/recordingReact";
import { visitTitle } from "@stacks/client-runtime/recordingView";
import { useAtomValue } from "@effect/atom-react";
import { StackActions, useNavigation } from "@react-navigation/native";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { useEffect, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { GlassSurface } from "../components/ui/GlassSurface";
import { PressableScale } from "../components/ui/PressableScale";
import { Sheet } from "../components/ui/Sheet";
import { useGo } from "../lib/go";
import { useStacks } from "../lib/stacks";

/** What of your table a screen already shows: the session itself, or a trip that pins it first. */
export type ShowsTable = { readonly session: SessionId } | { readonly trip: TripId };

type Placement = {
  /** Room to leave below the bar, such as a tab bar. */
  bottom?: number;
  onHeightChange?: (height: number) => void;
};

/** Your own live sessions, newest first, leaving out the one on screen. */
function useLiveSessions(except?: VisitId) {
  const { home } = useRecordingHome();
  return (home?.active ?? []).filter((item) => item.visit.id !== except);
}

/**
 * What you're playing, pinned to the bottom of every screen in Crew that isn't showing it, so a
 * live session never goes missing: your own sessions, else your seat at a group's table.
 */
export function LiveBar({ shows, ...placement }: Placement & { shows?: ShowsTable }) {
  const live = useLiveSessions().length > 0;
  return live ? (
    <Pinned {...placement}>
      <LiveSessionsBar />
    </Pinned>
  ) : (
    <Seat shows={shows} {...placement} />
  );
}

/** Your own live sessions, for screens that read nothing from an account. */
export function PersonalLiveBar(placement: Placement) {
  const live = useLiveSessions().length > 0;
  const { onHeightChange } = placement;
  useEffect(() => {
    if (!live) onHeightChange?.(0);
  }, [live, onHeightChange]);
  return live ? (
    <Pinned {...placement}>
      <LiveSessionsBar />
    </Pinned>
  ) : null;
}

/**
 * One bar for your live sessions other than `except`. It goes straight to a single session; with
 * several it names the newest and opens a sheet to pick one. Nothing when there are none.
 */
export function LiveSessionsBar({ except }: { except?: VisitId }) {
  const navigation = useNavigation();
  const live = useLiveSessions(except);
  const [picking, setPicking] = useState(false);
  const [newest, ...rest] = live;
  if (!newest) return null;
  const open = (visitId: VisitId) => navigation.dispatch(StackActions.push("Play", { visitId }));
  const title = visitTitle(newest.table);
  const since = formatTime(newest.visit.startedAt);
  if (rest.length === 0)
    return (
      <Bar
        label={`Back to your session, ${title}, since ${since}`}
        hint="Goes back to your session"
        title={title}
        trailing={`since ${since}`}
        onPress={() => open(newest.visit.id)}
      />
    );
  return (
    <>
      <Bar
        label={`${live.length} live sessions, newest ${title}`}
        hint="Lists your live sessions"
        title={title}
        trailing={`+${rest.length} live`}
        onPress={() => setPicking(true)}
      />
      {picking ? (
        <Sheet open title="Live sessions" onClose={() => setPicking(false)}>
          {live.map((item) => (
            <Button
              key={item.visit.id}
              label={`${visitTitle(item.table)} · since ${formatTime(item.visit.startedAt)}`}
              variant="secondary"
              onPress={() => {
                setPicking(false);
                open(item.visit.id);
              }}
            />
          ))}
        </Sheet>
      ) : null}
    </>
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
  const since = formatTime(seat.startedAt);
  return (
    <Pinned {...placement}>
      <Bar
        label={`Back to your table at ${seat.venueName}, since ${since}`}
        hint="Goes back to your table"
        title={seat.venueName}
        trailing={`since ${since}`}
        onPress={() => go.session(seat.id)}
      />
    </Pinned>
  );
}

function Pinned({ bottom, onHeightChange, children }: Placement & { children: ReactNode }) {
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
      {children}
    </View>
  );
}

function Bar({
  label,
  hint,
  title,
  trailing,
  onPress,
}: {
  label: string;
  hint: string;
  title: string;
  trailing: string;
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
        <Text className="font-mono text-xs text-muted">{trailing}</Text>
        <Icon name="chevron-right" color="muted" size={16} />
      </GlassSurface>
    </PressableScale>
  );
}
