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
} from "@stacks/client-runtime/trip";
import { tripAwards, tripFeed, tripNights, tripStandings } from "@stacks/shared/trips";
import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  type TextStyle,
} from "react-native";

import { cn } from "../components/ui/cn";
import { Chip } from "./Chip";

const mono: TextStyle = { fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) };
const label = "text-[11px] font-semibold tracking-[2px] uppercase";
const tone = (n: number) =>
  n > 0 ? "text-board-win" : n < 0 ? "text-board-loss" : "text-board-muted";

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
      className="overflow-hidden border-b border-board-rule bg-board-deep py-2"
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
              style={[mono, { flexShrink: 0 }]}
              className="mr-8 text-xs text-board-amber"
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
  const navigation = useNavigation();
  const currency = detail.group.currency;
  const names = playerNames(detail);
  const name = (playerId: PlayerId) => names.get(playerId) ?? "Someone";
  const closed = trip.sessions.filter((s) => s.session.status === "closed");
  const live = trip.sessions.filter((s) => s.session.status === "live");
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
    <View className="flex-1 bg-board">
      {ticker.length > 0 ? <Ticker items={ticker} /> : null}
      <View className="gap-7 px-4 pt-5 pb-8">
        <View className="flex-row items-end justify-between gap-4">
          <View className="flex-1 gap-1">
            <Text className={cn(label, "text-board-amber")}>
              {trip.trip.endedAt === null ? "On the board" : "Final board"}
            </Text>
            <Text
              numberOfLines={1}
              className="text-2xl font-black tracking-tight text-board-ink uppercase"
            >
              {tonight ? nightLabel(tonight) : "Before the first hand"}
            </Text>
          </View>
          <View className="items-end">
            <Text className={cn(label, "text-board-muted")}>Table</Text>
            <Text style={mono} className={cn("text-lg", tone(total))}>
              {boardMoney(total, currency)}
            </Text>
          </View>
        </View>

        {live.map((s) => (
          <Pressable
            key={s.session.id}
            accessibilityRole="button"
            accessibilityLabel={`Live now at ${s.venue.name}`}
            onPress={() => navigation.navigate("Session", { sessionId: s.session.id })}
            className="min-h-11 flex-row items-center gap-3 rounded-xl border border-board-rule bg-board-panel px-3 py-2 active:opacity-80"
          >
            <View className="size-2 rounded-full bg-board-loss" />
            <Text className={cn(label, "text-board-loss")}>Live</Text>
            <Text numberOfLines={1} className="flex-1 font-semibold text-board-ink uppercase">
              {s.venue.name}
            </Text>
          </Pressable>
        ))}

        <View className="gap-2">
          <View className="flex-row justify-between">
            <Text accessibilityRole="header" className={cn(label, "text-board-muted")}>
              The board
            </Text>
            <Text className={cn(label, "text-board-muted")}>
              {closed.length} {closed.length === 1 ? "session" : "sessions"}
            </Text>
          </View>
          {standings.length === 0 ? (
            <Text className="rounded-xl border border-board-rule bg-board-panel p-4 text-sm text-board-muted">
              The board fills in when the trip's first session closes. Start one and play.
            </Text>
          ) : (
            <View className="overflow-hidden rounded-xl border border-board-rule bg-board-panel">
              {standings.map((s, index) => {
                const you = s.playerId === detail.myPlayerId;
                return (
                  <View
                    key={s.playerId}
                    accessible
                    accessibilityLabel={`${s.rank}. ${name(s.playerId)}${you ? ", you" : ""}: ${boardMoney(s.net, currency)} over ${s.sessions} sessions${s.hot ? ", on a heater" : ""}`}
                    className={cn(
                      "flex-row items-center gap-2.5 px-3 py-3",
                      index > 0 && "border-t border-board-rule",
                      you && "border-l-[3px] border-l-board-amber",
                    )}
                  >
                    <Text style={mono} className="w-6 text-xl font-bold text-board-amber">
                      {s.rank}
                    </Text>
                    <Text
                      style={mono}
                      className={cn(
                        "w-6 text-xs",
                        s.moved > 0 ? "text-board-win" : "text-board-loss",
                      )}
                    >
                      {s.moved === 0 ? "" : `${s.moved > 0 ? "▲" : "▼"}${Math.abs(s.moved)}`}
                    </Text>
                    <Chip chip={chipOf(detail, s.playerId)} name={name(s.playerId)} size={30} />
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text
                          numberOfLines={1}
                          className="shrink font-bold text-board-ink uppercase"
                        >
                          {name(s.playerId)}
                        </Text>
                        {s.hot ? (
                          <Text
                            style={mono}
                            className="rounded-sm bg-board-amber px-1 text-[10px] font-bold text-board-amber-ink"
                          >
                            HOT
                          </Text>
                        ) : null}
                      </View>
                      <Text style={mono} className="text-xs text-board-muted">
                        {s.sessions} SESS{you ? " · YOU" : ""}
                      </Text>
                    </View>
                    <Text style={mono} className={cn("text-lg font-bold", tone(s.net))}>
                      {boardMoney(s.net, currency)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {awards.length > 0 ? (
          <View className="gap-2">
            <Text accessibilityRole="header" className={cn(label, "text-board-muted")}>
              Props hit
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {awards.map((award) => (
                <View
                  key={award.key}
                  accessible
                  className="basis-[48%] grow gap-2 rounded-xl border border-board-rule bg-board-panel p-3"
                >
                  <Text className={cn(label, "text-board-amber")}>{awardTitles[award.key]}</Text>
                  <View className="flex-row items-center gap-2">
                    <Chip
                      chip={chipOf(detail, award.playerId)}
                      name={name(award.playerId)}
                      size={22}
                    />
                    <Text numberOfLines={1} className="shrink font-bold text-board-ink uppercase">
                      {name(award.playerId)}
                    </Text>
                  </View>
                  <Text className="text-xs text-board-muted">{awardLine(award, currency)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {nights.length > 0 ? (
          <View className="gap-1">
            <Text accessibilityRole="header" className={cn(label, "text-board-muted")}>
              Night by night
            </Text>
            {nights.toReversed().map((night, index) => (
              <View
                key={night.key}
                accessible
                className={cn(
                  "flex-row items-center gap-3 py-2.5",
                  index > 0 && "border-t border-board-rule",
                )}
              >
                <Text style={mono} className="w-7 text-sm text-board-amber">
                  D{night.number}
                </Text>
                <Text style={mono} className="w-9 text-sm text-board-ink uppercase">
                  {nightLabel(night).split(" · ")[1]!.slice(0, 3)}
                </Text>
                <Text style={mono} className="w-14 text-sm text-board-muted">
                  {night.sessions.length} sess
                </Text>
                <Text
                  style={mono}
                  numberOfLines={1}
                  className="flex-1 text-sm text-board-ink uppercase"
                >
                  {night.winner ? name(night.winner.playerId) : "—"}
                </Text>
                <Text style={mono} className={cn("text-sm", tone(night.winner?.net ?? 0))}>
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
