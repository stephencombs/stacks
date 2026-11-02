import { useNavigation } from "@react-navigation/native";
import type { GroupDetail, PlayerId, TripDetail } from "@stacks/contracts";
import { playerNames } from "@stacks/client-runtime/format";
import {
  awardLine,
  awardTitles,
  boardMoney,
  chipOf,
  localClock,
  nightLabel,
  recordLine,
  streakLine,
} from "@stacks/client-runtime/trip";
import {
  tonightBoard,
  tripAwards,
  tripDays,
  tripFeed,
  tripNights,
  tripStandings,
  tripStats,
} from "@stacks/shared/trips";
import * as DateTime from "effect/DateTime";
import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { cn } from "../components/ui/cn";
import { Chip } from "./Chip";

// Board readouts: small mono caps, like the labels on a sportsbook screen.
const label = "font-mono text-[11px] tracking-[1px] uppercase";
const tone = (n: number) => (n > 0 ? "text-win" : n < 0 ? "text-loss" : "text-muted");

/** The latest results sliding past, like the LED strip over a sportsbook. Still with Reduce Motion. */
function Ticker({ items }: { items: ReadonlyArray<{ key: string; text: string }> }) {
  const [offset] = useState(() => new Animated.Value(0));
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (width === 0) return;
    let loop: Animated.CompositeAnimation | null = null;
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!live || reduce) return;
      loop = Animated.loop(
        Animated.timing(offset, {
          toValue: -width / 2,
          duration: width * 25,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      loop.start();
    });
    return () => {
      live = false;
      loop?.stop();
    };
  }, [offset, width]);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="overflow-hidden border-b border-line bg-sunken py-2"
    >
      {/* A horizontal scroll view lets the strip run wider than the screen; it never scrolls. */}
      <ScrollView horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false}>
        <Animated.View
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
          style={{ flexDirection: "row", transform: [{ translateX: offset }] }}
        >
          {items.map((item) => (
            <Text
              key={item.key}
              numberOfLines={1}
              style={{ flexShrink: 0 }}
              className="mr-8 font-mono text-xs text-accent-text"
            >
              {item.text}
            </Text>
          ))}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

/** The trip as a casino sportsbook board: ticker, standings, awards and night-by-night. */
export function TripBoard({ detail, trip }: { detail: GroupDetail; trip: TripDetail }) {
  const currency = detail.group.currency;
  const names = playerNames(detail);
  const name = (playerId: PlayerId) => names.get(playerId) ?? "Someone";
  const closed = trip.sessions.filter((s) => s.session.status === "closed");
  const standings = tripStandings(closed, localClock);
  const nights = tripNights(closed, localClock);
  const awards = tripAwards(closed, localClock);
  const feed = tripFeed(closed);
  const tonight = nights.at(-1);
  const total = standings.reduce((sum, s) => sum + s.net, 0);
  const ticker = ["a", "b"].flatMap((copy) =>
    feed.map((f) => ({
      key: `${copy}-${f.session.session.id}-${f.playerId}`,
      text: `${name(f.playerId).toUpperCase()} ${boardMoney(f.net, currency)} · ${f.session.venue.name.toUpperCase()}`,
    })),
  );

  return (
    <View className="flex-1 bg-canvas">
      {ticker.length > 0 ? <Ticker items={ticker} /> : null}
      <View className="gap-7 px-4 pt-5 pb-8">
        <View className="flex-row items-end justify-between gap-4">
          <View className="flex-1 gap-1">
            <Text className={cn(label, "text-muted")}>
              {trip.trip.endedAt === null ? "On the board" : "Final board"}
            </Text>
            <Text numberOfLines={1} className="font-display text-4xl leading-10 text-ink uppercase">
              {tonight ? nightLabel(tonight) : "Before the first hand"}
            </Text>
          </View>
          <View className="items-end">
            <Text className={cn(label, "text-muted")}>Table</Text>
            <Text className={cn("font-mono", "text-lg", tone(total))}>
              {boardMoney(total, currency)}
            </Text>
          </View>
        </View>

        <View className="gap-2">
          <View className="flex-row justify-between">
            <Text accessibilityRole="header" className="text-[15px] font-semibold text-ink">
              The board
            </Text>
            <Text className={cn(label, "text-muted")}>
              {closed.length} {closed.length === 1 ? "session" : "sessions"}
            </Text>
          </View>
          {standings.length === 0 ? (
            <Text className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">
              Close a session to put it on the board.
            </Text>
          ) : (
            <View className="overflow-hidden rounded-xl border border-line bg-surface">
              {standings.map((s, index) => {
                const you = s.playerId === detail.myPlayerId;
                return (
                  <View
                    key={s.playerId}
                    accessible
                    accessibilityLabel={`${s.rank}. ${name(s.playerId)}${you ? ", you" : ""}: ${boardMoney(s.net, currency)} over ${s.sessions} sessions${s.hot ? ", on a heater" : ""}`}
                    className={cn(
                      "flex-row items-center gap-2.5 px-3 py-3",
                      index > 0 && "border-t border-line",
                      you && "border-l-[3px] border-l-accent",
                    )}
                  >
                    <Text className="font-mono w-6 text-xl text-accent-text">{s.rank}</Text>
                    <Text
                      className={cn(
                        "font-mono",
                        "w-6 text-xs",
                        s.moved > 0 ? "text-win" : "text-loss",
                      )}
                    >
                      {s.moved === 0 ? "" : `${s.moved > 0 ? "▲" : "▼"}${Math.abs(s.moved)}`}
                    </Text>
                    <Chip chip={chipOf(detail, s.playerId)} name={name(s.playerId)} size={30} />
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text
                          numberOfLines={1}
                          className="shrink font-display text-lg leading-6 tracking-wide text-ink uppercase"
                        >
                          {name(s.playerId)}
                        </Text>
                        {s.hot ? (
                          <Text className="rounded-sm bg-accent px-1 font-mono text-[10px] text-accent-ink">
                            HOT
                          </Text>
                        ) : null}
                      </View>
                      <Text className="font-mono text-xs text-muted">
                        {s.sessions} SESS{you ? " · YOU" : ""}
                        {streakLine(s.streak) ? ` · ${streakLine(s.streak)!.toUpperCase()}` : ""}
                      </Text>
                    </View>
                    <Text className={cn("font-mono", "text-lg", tone(s.net))}>
                      {boardMoney(s.net, currency)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {closed.length > 0 ? <TripNumbers detail={detail} trip={trip} /> : null}

        {awards.length > 0 ? (
          <View className="gap-2">
            <Text accessibilityRole="header" className="text-[15px] font-semibold text-ink">
              Awards
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {awards.map((award) => (
                <View
                  key={award.key}
                  accessible
                  className="basis-[48%] grow gap-2 rounded-xl border border-line bg-surface p-3"
                >
                  <Text className={cn(label, "text-muted")}>{awardTitles[award.key]}</Text>
                  <View className="flex-row items-center gap-2">
                    <Chip
                      chip={chipOf(detail, award.playerId)}
                      name={name(award.playerId)}
                      size={22}
                    />
                    <Text
                      numberOfLines={1}
                      className="shrink font-display text-lg leading-6 tracking-wide text-ink uppercase"
                    >
                      {name(award.playerId)}
                    </Text>
                  </View>
                  <Text className="text-xs text-muted">{awardLine(award, currency)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {nights.length > 0 ? (
          <View className="gap-1">
            <Text accessibilityRole="header" className="text-[15px] font-semibold text-ink">
              Night by night
            </Text>
            {nights.toReversed().map((night, index) => (
              <View
                key={night.key}
                accessible
                className={cn(
                  "flex-row items-center gap-3 py-2.5",
                  index > 0 && "border-t border-line",
                )}
              >
                <Text className="font-mono w-7 text-sm text-accent-text">D{night.number}</Text>
                <Text className="font-mono w-9 text-sm text-ink uppercase">
                  {nightLabel(night).split(" · ")[1]!.slice(0, 3)}
                </Text>
                <Text className="font-mono w-14 text-sm text-muted">
                  {night.sessions.length} sess
                </Text>
                <Text numberOfLines={1} className="font-mono flex-1 text-sm text-ink uppercase">
                  {night.winner ? name(night.winner.playerId) : "—"}
                </Text>
                <Text className={cn("font-mono", "text-sm", tone(night.winner?.net ?? 0))}>
                  {night.winner ? boardMoney(night.winner.net, currency) : ""}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Tonight only: who's up from tables that finished, and what's still in play at live ones. */
export function TonightBoard({ detail, trip }: { detail: GroupDetail; trip: TripDetail }) {
  const navigation = useNavigation();
  const currency = detail.group.currency;
  const names = playerNames(detail);
  const name = (playerId: PlayerId) => names.get(playerId) ?? "Someone";
  const closed = trip.sessions.filter((s) => s.session.status === "closed");
  const live = trip.sessions.filter((s) => s.session.status === "live");
  const rows = tonightBoard(closed, live, localClock, DateTime.nowUnsafe());
  const inPlayTotal = rows.reduce((sum, r) => sum + r.inPlay, 0);

  return (
    <View className="gap-7 bg-canvas px-4 pt-5 pb-8">
      <View className="flex-row items-end justify-between gap-4">
        <View className="flex-1 gap-1">
          <Text className={cn(label, "text-muted")}>Who's up</Text>
          <Text className="font-display text-4xl leading-10 text-ink uppercase">Tonight</Text>
        </View>
        {inPlayTotal > 0 ? (
          <View className="items-end">
            <Text className={cn(label, "text-muted")}>In play</Text>
            <Text className="font-mono text-lg text-accent-text">
              {boardMoney(inPlayTotal, currency, false)}
            </Text>
          </View>
        ) : null}
      </View>

      {live.map((s) => (
        <Pressable
          key={s.session.id}
          accessibilityRole="button"
          accessibilityLabel={`Live now at ${s.venue.name}`}
          onPress={() => navigation.navigate("Session", { sessionId: s.session.id })}
          className="min-h-11 flex-row items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2 active:opacity-80"
        >
          <View className="size-2 rounded-full bg-loss" />
          <Text className={cn(label, "text-loss")}>Live</Text>
          <Text numberOfLines={1} className="flex-1 text-base font-medium text-ink">
            {s.venue.name}
          </Text>
          <Text className="font-mono text-xs text-muted">{s.playing.length} playing</Text>
        </Pressable>
      ))}

      {rows.length === 0 ? (
        <Text className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">
          Nothing on the board tonight. Results land here as players cash out.
        </Text>
      ) : (
        <View className="overflow-hidden rounded-xl border border-line bg-surface">
          {rows.map((r, index) => {
            const you = r.playerId === detail.myPlayerId;
            const result = r.net === null ? "no result yet" : boardMoney(r.net, currency);
            const inPlay = r.inPlay > 0 ? `IN PLAY ${boardMoney(r.inPlay, currency, false)}` : "";
            return (
              <View
                key={r.playerId}
                accessible
                accessibilityLabel={`${r.rank}. ${name(r.playerId)}${you ? ", you" : ""}: ${result}${r.inPlay > 0 ? `, ${boardMoney(r.inPlay, currency, false)} in play` : ""}`}
                className={cn(
                  "flex-row items-center gap-2.5 px-3 py-3",
                  index > 0 && "border-t border-line",
                  you && "border-l-[3px] border-l-accent",
                )}
              >
                <Text className="w-6 font-mono text-xl text-accent-text">{r.rank}</Text>
                <Chip chip={chipOf(detail, r.playerId)} name={name(r.playerId)} size={30} />
                <View className="flex-1">
                  <Text
                    numberOfLines={1}
                    className="font-display text-lg leading-6 tracking-wide text-ink uppercase"
                  >
                    {name(r.playerId)}
                  </Text>
                  {inPlay || you ? (
                    <Text className="font-mono text-xs text-muted">
                      <Text className="text-accent-text">{inPlay}</Text>
                      {inPlay && you ? " · " : ""}
                      {you ? "YOU" : ""}
                    </Text>
                  ) : null}
                </View>
                {r.net === null ? (
                  <Text className="font-mono text-lg text-faint">—</Text>
                ) : (
                  <Text className={cn("font-mono text-lg", tone(r.net))}>
                    {boardMoney(r.net, currency)}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** How the group ran as a team, and the trip's numbers: totals, extremes, drawdown, high limit. */
function TripNumbers({ detail, trip }: { detail: GroupDetail; trip: TripDetail }) {
  const currency = detail.group.currency;
  const names = playerNames(detail);
  const stats = tripStats(trip.sessions.filter((s) => s.session.status === "closed"));
  const money = (n: number) => boardMoney(Math.round(n), currency);
  const { current, longestWin, longestLoss } = stats.team;
  const tables = (n: number) => `${n} ${n === 1 ? "table" : "tables"}`;
  const tiles: ReadonlyArray<{ label: string; value: string; tone: number; note?: string }> = [
    {
      label: "Gross wins",
      value: boardMoney(stats.grossWins, currency, false),
      tone: 1,
      note: "Every winning result",
    },
    {
      label: "Gross losses",
      value: money(stats.grossLosses),
      tone: -1,
      note: "Every losing result",
    },
    { label: "Average table", value: money(stats.average), tone: stats.average },
    {
      label: "Largest drawdown",
      value: money(stats.drawdown),
      tone: stats.drawdown,
      note: "Biggest drop from a high",
    },
    ...(stats.best
      ? [
          {
            label: "Best result",
            value: money(stats.best.net),
            tone: stats.best.net,
            note: names.get(stats.best.playerId) ?? "",
          },
        ]
      : []),
    ...(stats.worst
      ? [
          {
            label: "Worst result",
            value: money(stats.worst.net),
            tone: stats.worst.net,
            note: names.get(stats.worst.playerId) ?? "",
          },
        ]
      : []),
    ...(stats.highLimit.sessions > 0
      ? [
          {
            label: "High limit",
            value: money(stats.highLimit.net),
            tone: stats.highLimit.net,
            note: tables(stats.highLimit.sessions),
          },
          {
            label: "Other tables",
            value: money(stats.otherTables.net),
            tone: stats.otherTables.net,
            note: tables(stats.otherTables.sessions),
          },
        ]
      : []),
  ];
  return (
    <>
      <View className="gap-2">
        <View className="flex-row items-baseline justify-between">
          <Text accessibilityRole="header" className="text-[15px] font-semibold text-ink">
            As a team
          </Text>
          <Text className={cn(label, "text-muted")}>
            {`${stats.record.wins}W · ${stats.record.losses}L · ${stats.record.mixed} mixed`}
          </Text>
        </View>
        <View accessible className="gap-3 rounded-xl border border-line bg-surface p-4">
          <Text
            className={cn(
              "font-display text-2xl leading-7 tracking-wide uppercase",
              current ? (current.result === "win" ? "text-win" : "text-loss") : "text-muted",
            )}
          >
            {current
              ? `${current.length} ${current.result === "win" ? (current.length === 1 ? "win" : "wins") : current.length === 1 ? "loss" : "losses"} in a row`
              : "No run going"}
          </Text>
          <View className="flex-row gap-3">
            {[
              ["Best run", String(longestWin)],
              ["Worst run", String(longestLoss)],
              ["Team wins", `${Math.round(stats.winRate * 100)}%`],
            ].map(([title, value]) => (
              <View key={title} className="flex-1 gap-0.5">
                <Text className={cn(label, "text-muted")}>{title}</Text>
                <Text className="font-mono text-base text-ink">{value}</Text>
              </View>
            ))}
          </View>
          <Text className="text-xs text-muted">
            A team win is a table where everyone who played won; a team loss, where everyone lost.
            Anything else is mixed and ends a run.
          </Text>
        </View>
      </View>

      <View className="gap-2">
        <Text accessibilityRole="header" className="text-[15px] font-semibold text-ink">
          The numbers
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {tiles.map((tile) => (
            <View
              key={tile.label}
              accessible
              className="basis-[48%] grow gap-1 rounded-xl border border-line bg-surface p-3"
            >
              <Text className={cn(label, "text-muted")}>{tile.label}</Text>
              <Text className={cn("font-mono text-lg", tone(tile.tone))}>{tile.value}</Text>
              {tile.note ? (
                <Text numberOfLines={1} className="text-xs text-muted">
                  {tile.note}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      </View>
    </>
  );
}

/** The trip night by night: every player's net, with their record, or that they sat it out. */
export function DaysBoard({ detail, trip }: { detail: GroupDetail; trip: TripDetail }) {
  const currency = detail.group.currency;
  const names = playerNames(detail);
  const closed = trip.sessions.filter((s) => s.session.status === "closed");
  const players = [...new Set(closed.flatMap((s) => s.results.map((r) => r.playerId)))];
  const days = tripDays(closed, localClock, players);
  const nights = tripNights(closed, localClock);
  if (days.length === 0)
    return (
      <Text className="mx-4 rounded-xl border border-line bg-surface p-4 text-sm text-muted">
        Close a session to start the first night.
      </Text>
    );
  return (
    <View className="gap-4 px-4 pb-8">
      {days.toReversed().map((day) => (
        <View key={day.key} className="gap-2">
          <View className="flex-row items-baseline justify-between">
            <Text
              accessibilityRole="header"
              className="font-display text-xl tracking-wide text-ink uppercase"
            >
              {nightLabel(nights.find((n) => n.key === day.key)!)}
            </Text>
            <Text className={cn(label, "text-muted")}>
              {day.sessions} {day.sessions === 1 ? "table" : "tables"}
            </Text>
          </View>
          <View className="rounded-xl border border-line bg-surface">
            {day.rows.map((row, index) => (
              <View
                key={row.playerId}
                accessible
                className={cn(
                  "flex-row items-center gap-3 px-3 py-3",
                  index > 0 && "border-t border-line",
                )}
              >
                <Chip
                  chip={chipOf(detail, row.playerId)}
                  name={names.get(row.playerId) ?? "?"}
                  size={26}
                />
                <View className="flex-1">
                  <Text numberOfLines={1} className="text-base text-ink">
                    {names.get(row.playerId) ?? "Someone"}
                  </Text>
                  <Text className="font-mono text-xs text-muted">
                    {row.net === null
                      ? "No results recorded"
                      : recordLine(row.wins, row.losses, row.even)}
                  </Text>
                </View>
                <Text
                  className={cn(
                    "font-mono text-lg",
                    row.net === null ? "text-muted" : tone(row.net),
                  )}
                >
                  {row.net === null ? "—" : boardMoney(row.net, currency)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
