import type { SessionId, TableId, TripId, VisitId } from "@stacks/contracts";
import { formatTime } from "@stacks/client-runtime/format";
import { useRecordingHome } from "@stacks/client-runtime/recordingReact";
import { tableTitle, visitTitle } from "@stacks/client-runtime/recordingView";
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

/** Somewhere live to go back to: a session you're playing, or a table you record at. */
type LivePlace = {
  readonly key: string;
  readonly title: string;
  readonly trailing: string;
  readonly to: { readonly visitId: VisitId } | { readonly tableId: TableId };
};

/**
 * Your own live sessions, newest first, then the tables you record for everyone at without
 * playing, leaving out the one on screen (a visit's or a table's ID).
 */
function useLiveSessions(except?: string) {
  const { home } = useRecordingHome();
  const places: ReadonlyArray<LivePlace> = [
    ...(home?.active ?? []).map((item) => ({
      key: item.visit.id,
      title: visitTitle(item.table),
      trailing: `since ${formatTime(item.visit.startedAt)}`,
      to: { visitId: item.visit.id },
    })),
    ...(home?.tables ?? []).map((item) => ({
      key: item.table.id,
      title: tableTitle(item.table),
      trailing: item.startedAt ? `since ${formatTime(item.startedAt)}` : "Nobody playing yet",
      to: { tableId: item.table.id },
    })),
  ];
  return places.filter((item) => item.key !== except);
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
export function LiveSessionsBar({ except }: { except?: string }) {
  const navigation = useNavigation();
  const live = useLiveSessions(except);
  const [picking, setPicking] = useState(false);
  const [newest, ...rest] = live;
  if (!newest) return null;
  const open = (place: LivePlace) =>
    navigation.dispatch(
      "visitId" in place.to
        ? StackActions.push("Play", { visitId: place.to.visitId })
        : StackActions.push("Table", { tableId: place.to.tableId }),
    );
  const title = newest.title;
  if (rest.length === 0)
    return (
      <Bar
        label={`${"visitId" in newest.to ? "Back to your session" : "Back to the table"}, ${title}, ${newest.trailing}`}
        hint={"visitId" in newest.to ? "Goes back to your session" : "Goes back to the table"}
        title={title}
        trailing={newest.trailing}
        onPress={() => open(newest)}
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
              key={item.key}
              label={`${item.title} · ${item.trailing}`}
              variant="secondary"
              onPress={() => {
                setPicking(false);
                open(item);
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
