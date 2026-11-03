import type { GroupDetail, PlayerId, TripDetail } from "@stacks/contracts";
import { playerNames } from "@stacks/client-runtime/format";
import {
  awardLine,
  awardTitles,
  boardMoney,
  chipOf,
  localClock,
  nightLabel,
  streakLine,
} from "@stacks/client-runtime/trip";
import { tripAwards, tripNights, tripStandings, tripStats } from "@stacks/shared/trips";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { cn } from "../components/ui/cn";
import { Chip } from "./Chip";
import { RaceHero } from "./RaceHero";
import { PlayerSheet } from "./RaceStats";
import { TripRoute } from "./TripRoute";

const label = "text-sm";
const tone = (n: number) => (n > 0 ? "text-win" : n < 0 ? "text-loss" : "text-muted");

/**
 * The Board for one trip: the race, the standings (tap a player for their sheet), the casinos the
 * trip played, how the table did as a team, and the awards.
 */
export function TripBoard({ detail, trip }: { detail: GroupDetail; trip: TripDetail }) {
  const currency = detail.group.currency;
  const names = playerNames(detail);
  const name = (playerId: PlayerId) => names.get(playerId) ?? "Someone";
  const closed = trip.sessions.filter((s) => s.session.status === "closed");
  const standings = tripStandings(closed, localClock);
  const nights = tripNights(closed, localClock);
  const awards = tripAwards(closed, localClock);
  const tonight = nights.at(-1);
  const total = standings.reduce((sum, s) => sum + s.net, 0);
  const played = standings.some((s) => s.playerId === detail.myPlayerId);
  const [picked, setPicked] = useState(played ? detail.myPlayerId : standings[0]?.playerId);
  const shown = standings.find((s) => s.playerId === picked) ?? standings[0];

  return (
    <>
      <RaceHero detail={detail} trip={trip} />
      <View className="flex-row items-end justify-between gap-4">
        <View className="flex-1 gap-1">
          <Text className={cn(label, "text-muted")}>
            {trip.trip.endedAt === null ? "On the board" : "Final board"}
          </Text>
          <Text className="text-lg font-semibold text-ink">
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
          <Text accessibilityRole="header" className="text-lg font-semibold text-ink">
            Standings
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
                <Pressable
                  key={s.playerId}
                  accessibilityRole="button"
                  accessibilityState={{ selected: s.playerId === shown?.playerId }}
                  accessibilityLabel={`${s.rank}. ${name(s.playerId)}${you ? ", you" : ""}: ${boardMoney(s.net, currency)} over ${s.sessions} sessions${s.hot ? ", on a heater" : ""}`}
                  accessibilityHint="Shows their stats"
                  onPress={() => setPicked(s.playerId)}
                  className={cn(
                    "flex-row items-center gap-2.5 px-3 py-3 active:bg-sunken",
                    index > 0 && "border-t border-line",
                    s.playerId === shown?.playerId && "border-l-[3px] border-l-accent",
                  )}
                >
                  <Text className="w-6 font-mono text-xl text-accent-text">{s.rank}</Text>
                  <Text
                    className={cn("w-6 font-mono text-xs", s.moved > 0 ? "text-win" : "text-loss")}
                  >
                    {s.moved === 0 ? "" : `${s.moved > 0 ? "▲" : "▼"}${Math.abs(s.moved)}`}
                  </Text>
                  <Chip chip={chipOf(detail, s.playerId)} name={name(s.playerId)} size={30} />
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text numberOfLines={1} className="shrink text-base font-medium text-ink">
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
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {shown ? (
        <PlayerSheet
          key={shown.playerId}
          sessions={closed}
          player={{
            playerId: shown.playerId,
            name: name(shown.playerId),
            chip: chipOf(detail, shown.playerId),
          }}
          rank={shown.rank}
          of={standings.length}
          currency={currency}
        />
      ) : null}

      <TripRoute detail={detail} trip={trip} />

      {closed.length > 0 ? <TripNumbers detail={detail} trip={trip} /> : null}

      {awards.length > 0 ? (
        <View className="gap-2">
          <Text accessibilityRole="header" className="text-lg font-semibold text-ink">
            Awards
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {awards.map((award) => (
              <View
                key={award.key}
                accessible
                className="grow basis-[48%] gap-2 rounded-xl border border-line bg-surface p-3"
              >
                <Text className={cn(label, "text-muted")}>{awardTitles[award.key]}</Text>
                <View className="flex-row items-center gap-2">
                  <Chip
                    chip={chipOf(detail, award.playerId)}
                    name={name(award.playerId)}
                    size={22}
                  />
                  <Text numberOfLines={1} className="shrink text-base font-medium text-ink">
                    {name(award.playerId)}
                  </Text>
                </View>
                <Text className="text-xs text-muted">{awardLine(award, currency)}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </>
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
          <Text accessibilityRole="header" className="text-lg font-semibold text-ink">
            As a team
          </Text>
          <Text className={cn(label, "text-muted")}>
            {`${stats.record.wins}W · ${stats.record.losses}L · ${stats.record.mixed} mixed`}
          </Text>
        </View>
        <View accessible className="gap-3 rounded-xl border border-line bg-surface p-4">
          <Text
            className={cn(
              "text-lg font-semibold",
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
        <Text accessibilityRole="header" className="text-lg font-semibold text-ink">
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
