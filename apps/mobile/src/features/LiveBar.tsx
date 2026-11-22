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
import { useEffect, useState, type ReactNode } from "react";
import { Platform, View } from "react-native";
import { Text } from "../components/ui/Text";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "../components/ui/Button";
import { cn } from "../components/ui/cn";
import { GlassSurface } from "../components/ui/GlassSurface";
import { MarqueeText } from "../components/ui/MarqueeText";
import { PressableScale } from "../components/ui/PressableScale";
import { Sheet } from "../components/ui/Sheet";
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

type LivePlace = {
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

function useLiveSessions(except?: string) {
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

  const { title, game, startedAt, venueName, suffix } = newest;

  if (rest.length === 0)
    return (
      <Bar
        label={`${"visitId" in newest.to ? "Back to your session" : "Back to the table"}, ${title}, ${startedAt ? `since ${formatTime(startedAt)}, ` : ""}${detailOf(newest)}`}
        hint={"visitId" in newest.to ? "Goes back to your session" : "Goes back to the table"}
        title={title}
        game={game}
        venueName={venueName}
        suffix={suffix}
        startedAt={startedAt}
        onPress={() => open(newest)}
      />
    );

  return (
    <>
      <Bar
        label={`${live.length} live sessions, newest ${title}`}
        hint="Lists your live sessions"
        title={title}
        game={game}
        lead={`+${rest.length} more`}
        venueName={venueName}
        suffix={suffix}
        startedAt={startedAt}
        onPress={() => setPicking(true)}
      />
      {picking ? (
        <Sheet open title="Live sessions" onClose={() => setPicking(false)}>
          {live.map((item) => (
            <Button
              key={item.key}
              label={`${item.title} · ${detailOf(item)}`}
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

type BarContentProps = {
  title: string;
  game: Game | null;
  lead?: string;
  venueName?: string | undefined;
  suffix?: string;
  startedAt: DateTime.Utc | null;
};

function BarContent({ title, game, lead, venueName, suffix, startedAt }: BarContentProps) {
  const subtitle = "type-footnote text-muted";

  return (
    <View className="min-h-14 flex-row items-center gap-3 px-4 py-2">
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
