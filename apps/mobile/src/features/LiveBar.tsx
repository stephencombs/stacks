import type { Game, SessionId, TableId, TripId, VisitId } from "@stacks/contracts";
import { formatTime } from "@stacks/client-runtime/format";
import { useRecordingClock, useRecordingHome } from "@stacks/client-runtime/recordingReact";
import {
  elapsedClock,
  RECORDING_CURRENCY,
  tableTitle,
  visitTitle,
} from "@stacks/client-runtime/recordingView";
import { gameChip } from "@stacks/client-runtime/stats";
import { useAtomValue } from "@effect/atom-react";
import { StackActions, useNavigation } from "@react-navigation/native";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import type * as DateTime from "effect/DateTime";
import { use, useEffect, useState, type ReactNode } from "react";
import { Platform, View } from "react-native";
import { Text } from "../components/ui/Text";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "../components/ui/Button";
import { cn } from "../components/ui/cn";
import { GlassSurface } from "../components/ui/GlassSurface";
import { MarqueeText } from "../components/ui/MarqueeText";
import { PressableScale } from "../components/ui/PressableScale";
import { Sheet } from "../components/ui/Sheet";
import { LiveAccessoryHeight } from "../components/ui/tabBar";
import { useGo } from "../lib/go";
import { formatDisplayMoney, usePreferences } from "../lib/preferences";
import { useStacks } from "../lib/stacks";
import { chipColor } from "./chipColor";

/** What of your table a screen already shows: the session itself, or a trip that pins it first. */
export type ShowsTable = { readonly session: SessionId } | { readonly trip: TripId };

type Placement = {
  /** Room to leave below the bar, such as a tab bar. */
  bottom?: number;
  onHeightChange?: (height: number) => void;
};

export type LivePlace = {
  readonly key: string;
  readonly title: string;
  readonly game: Game | null;
  readonly startedAt: DateTime.Utc | null;
  readonly venueName: string | undefined;
  readonly suffix: string;
  readonly to: { readonly visitId: VisitId } | { readonly tableId: TableId };
};

const detailOf = ({ venueName, suffix }: LivePlace) =>
  [venueName, suffix].filter(Boolean).join(" · ");

export function useLiveSessions(except?: string) {
  const { home } = useRecordingHome();
  const prefs = usePreferences();

  const places: ReadonlyArray<LivePlace> = [
    ...(home?.active ?? []).map((item) => ({
      key: item.visit.id,
      title: visitTitle(item.table),
      game: item.table.game,
      startedAt: item.visit.startedAt,
      venueName: item.venue?.name,
      suffix: `${formatDisplayMoney(item.totals.buyIn, RECORDING_CURRENCY, prefs)} in`,
      to: { visitId: item.visit.id },
    })),
    ...(home?.tables ?? []).map((item) => ({
      key: item.table.id,
      title: tableTitle(item.table),
      game: item.table.game,
      startedAt: item.startedAt,
      venueName: item.venue?.name,
      suffix: item.playing ? `${item.playing} playing` : "Nobody playing yet",
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
  const native = use(LiveAccessoryHeight) > 0;

  if (!live) return <Seat shows={shows} {...placement} />;

  return native ? (
    <Absent onHeightChange={placement.onHeightChange} />
  ) : (
    <Pinned {...placement}>
      <LiveSessionsBar />
    </Pinned>
  );
}

/** Your own live sessions, for screens that read nothing from an account. */
export function PersonalLiveBar(placement: Placement) {
  const live = useLiveSessions().length > 0;
  const native = use(LiveAccessoryHeight) > 0;

  return live && !native ? (
    <Pinned {...placement}>
      <LiveSessionsBar />
    </Pinned>
  ) : (
    <Absent onHeightChange={placement.onHeightChange} />
  );
}

function Absent({ onHeightChange }: Pick<Placement, "onHeightChange">) {
  useEffect(() => {
    onHeightChange?.(0);
  }, [onHeightChange]);

  return null;
}

/**
 * One bar for your live sessions other than `except`. It goes straight to a single session; with
 * several it names the newest and opens a sheet to pick one. Nothing when there are none.
 */
export function LiveSessionsBar({ except }: { except?: string }) {
  const live = useLiveSessions(except);
  const open = useOpenLive();
  const [picking, setPicking] = useState(false);
  const bar = liveBar(live, open, () => setPicking(true));

  if (!bar) return null;

  return (
    <>
      <Bar {...bar} />
      {picking ? <LivePicker live={live} onClose={() => setPicking(false)} /> : null}
    </>
  );
}

export function useOpenLive() {
  const navigation = useNavigation();

  return (place: LivePlace) =>
    navigation.dispatch(
      "visitId" in place.to
        ? StackActions.push("Play", { visitId: place.to.visitId })
        : StackActions.push("Table", { tableId: place.to.tableId }),
    );
}

/** What the bar says and does for these sessions: straight to one, or a pick among several. */
export function liveBar(
  live: ReadonlyArray<LivePlace>,
  open: (place: LivePlace) => void,
  pick: () => void,
) {
  const [newest, ...rest] = live;

  if (!newest) return null;

  const { title, game, startedAt, venueName, suffix } = newest;
  const content = { title, game, venueName, suffix, startedAt };

  if (rest.length === 0) {
    const visit = "visitId" in newest.to;

    return {
      ...content,
      label: `${visit ? "Back to your session" : "Back to the table"}, ${title}, ${startedAt ? `since ${formatTime(startedAt)}, ` : ""}${detailOf(newest)}`,
      hint: visit ? "Goes back to your session" : "Goes back to the table",
      onPress: () => open(newest),
    };
  }

  return {
    ...content,
    label: `${live.length} live sessions, newest ${title}`,
    hint: "Lists your live sessions",
    lead: `+${rest.length} more`,
    onPress: pick,
  };
}

export function LivePicker({
  live,
  onClose,
}: {
  live: ReadonlyArray<LivePlace>;
  onClose: () => void;
}) {
  const open = useOpenLive();

  return (
    <Sheet open title="Live sessions" onClose={onClose}>
      {live.map((item) => (
        <Button
          key={item.key}
          label={`${item.title} · ${detailOf(item)}`}
          variant="secondary"
          onPress={() => {
            onClose();
            open(item);
          }}
        />
      ))}
    </Sheet>
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
        game={null}
        startedAt={seat.startedAt}
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
      className="absolute inset-x-0 px-4"
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
  onPress,
  ...content
}: BarContentProps & { label: string; hint: string; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
    >
      <GlassSurface radius={16} interactive className="rounded-2xl">
        <BarContent {...content} />
      </GlassSurface>
    </PressableScale>
  );
}

export type BarContentProps = {
  title: string;
  game: Game | null;
  lead?: string;
  venueName?: string | undefined;
  suffix?: string;
  startedAt: DateTime.Utc | null;
  className?: string;
};

export function BarContent({
  title,
  game,
  lead,
  venueName,
  suffix,
  startedAt,
  className,
}: BarContentProps) {
  const subtitle = "type-footnote text-muted";

  return (
    <View className={cn("min-h-14 flex-row items-center gap-3 px-4 py-2", className)}>
      <View
        className={cn("size-8 rounded-full border-[3px] border-line", chipColor[gameChip(game)])}
      />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="type-callout font-semibold text-ink">
          {title}
        </Text>
        {suffix ? (
          <View className="min-w-0 flex-row">
            {lead ? (
              <Text numberOfLines={1} className={cn("shrink-0", subtitle)}>
                {`${lead} · `}
              </Text>
            ) : null}
            {venueName ? <MarqueeText className={subtitle}>{venueName}</MarqueeText> : null}
            <Text numberOfLines={1} className={cn("shrink-0", subtitle)}>
              {venueName ? ` · ${suffix}` : suffix}
            </Text>
          </View>
        ) : null}
      </View>
      {startedAt ? (
        <>
          <Elapsed since={startedAt} />
          <View className="size-2 rounded-full bg-live" />
        </>
      ) : null}
    </View>
  );
}

function Elapsed({ since }: { since: DateTime.Utc }) {
  const now = useRecordingClock();

  return (
    <Text
      className={cn("type-title text-ink tabular-nums", Platform.OS === "ios" && "font-semibold")}
    >
      {elapsedClock(since, now, "compact")}
    </Text>
  );
}
