import type { GroupDetail, PlayerId, SessionId, TripDetail } from "@stacks/contracts";
import { barTrack } from "@stacks/client-runtime/chart";
import { formatDay, playerNames } from "@stacks/client-runtime/format";
import { boardMoney, chipOf, localClock } from "@stacks/client-runtime/trip";
import { racePlaces, runningTotals, statSheet, type StatsSession } from "@stacks/shared/stats";
import { tripNights } from "@stacks/shared/trips";
import type * as DateTime from "effect/DateTime";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { cn } from "../components/ui/cn";
import { Chip } from "./Chip";

const label = "text-[11px] font-semibold tracking-[2px] uppercase";
const tone = (n: number) =>
  n > 0 ? "text-board-win" : n < 0 ? "text-board-loss" : "text-board-muted";

type Racer = { playerId: PlayerId; name: string; chip: number; running: ReadonlyArray<number> };

/** A closed session as the race sees it, oldest first. */
type RaceSession = StatsSession & {
  readonly session: { readonly id: SessionId; readonly startedAt: DateTime.Utc };
};
/** Where on the axis a stretch of sessions starts, such as a night or a trip. */
type Mark = { readonly index: number; readonly label: string };

/** A trip's stats, with the trip's nights along the race. */
export function TripStats({ detail, trip }: { detail: GroupDetail; trip: TripDetail }) {
  const closed = trip.sessions.filter((s) => s.session.status === "closed");
  const nights = tripNights(closed, localClock);
  const nightOf = new Map(
    nights.flatMap((night) => night.sessions.map((s) => [s.session.id, night.number])),
  );
  return (
    <RaceStats
      detail={detail}
      sessions={closed}
      marks={nights.map((night) => ({
        index: closed.indexOf(night.sessions[0]!),
        label: `D${night.number}`,
      }))}
      where={(session) => `Day ${nightOf.get(session.session.id)}`}
      latest={trip.trip.endedAt === null ? "The race so far" : "How it finished"}
      empty="Stats fill in when the trip's first session closes."
    />
  );
}

/** The race for first, session by session, and one player's stat sheet. */
export function RaceStats<S extends RaceSession>({
  detail,
  sessions: closed,
  marks,
  where,
  latest,
  empty,
}: {
  detail: GroupDetail;
  sessions: ReadonlyArray<S>;
  marks: ReadonlyArray<Mark>;
  /** Where a session sits, like "Day 3", after "After session 12 of 41". */
  where: (session: S) => string;
  /** The heading's lead-in at the latest session. */
  latest: string;
  empty: string;
}) {
  const names = playerNames(detail);
  const players = detail.players
    .map((player) => ({
      playerId: player.id,
      name: names.get(player.id) ?? player.displayName,
      chip: chipOf(detail, player.id),
      running: runningTotals(closed, player.id),
    }))
    .filter((player) => closed.some((s) => s.results.some((r) => r.playerId === player.playerId)))
    .toSorted((a, b) => b.running.at(-1)! - a.running.at(-1)!);
  const played = players.some((p) => p.playerId === detail.myPlayerId);
  const [picked, setPicked] = useState(played ? detail.myPlayerId : players[0]?.playerId);

  if (players.length === 0)
    return (
      <Text className="m-4 rounded-xl border border-board-rule bg-board-panel p-4 text-sm text-board-muted">
        {empty}
      </Text>
    );

  const player = players.find((p) => p.playerId === picked) ?? players[0]!;
  return (
    <View className="gap-8 px-4 pt-5 pb-10">
      <Race
        sessions={closed}
        players={players}
        currency={detail.group.currency}
        picked={player.playerId}
        onPick={setPicked}
        marks={marks}
        where={where}
        latest={latest}
      />
      <Sheet
        key={player.playerId}
        sessions={closed}
        player={player}
        rank={players.indexOf(player) + 1}
        of={players.length}
        currency={detail.group.currency}
      />
    </View>
  );
}

/** Line colors by chip. Chip 4 is near-black, so its line takes the board's light gray instead. */
function useLineColors() {
  const colors = useCSSVariable([
    "--color-board-muted",
    "--color-chip-1",
    "--color-chip-2",
    "--color-chip-3",
    "--color-chip-5",
    "--color-chip-6",
    "--color-chip-7",
    "--color-chip-8",
  ]).map(String);
  const [muted, ...chips] = colors;
  return (chip: number) => (chip === 4 ? muted! : chips[chip < 4 ? chip - 1 : chip - 2]!);
}

function Race<S extends RaceSession>({
  sessions,
  players,
  currency,
  picked,
  onPick,
  marks,
  where,
  latest,
}: {
  sessions: ReadonlyArray<S>;
  players: ReadonlyArray<Racer>;
  currency: GroupDetail["group"]["currency"];
  picked: PlayerId;
  onPick: (playerId: PlayerId) => void;
  marks: ReadonlyArray<Mark>;
  where: (session: S) => string;
  latest: string;
}) {
  const last = sessions.length - 1;
  const [at, setAt] = useState(last);
  const [width, setWidth] = useState(0);
  const lineColor = useLineColors();
  const [rule, amber, board] = useCSSVariable([
    "--color-board-rule",
    "--color-board-amber",
    "--color-board",
  ]).map(String);

  // Places, not dollars: one big winner would flatten everyone else's line.
  const places = racePlaces(
    sessions,
    players.map((p) => p.playerId),
  );
  const height = 40 * Math.max(2, players.length) + 28;
  const pad = { x: 10, top: 12, bottom: 28 };
  const x = (i: number) => pad.x + (i / Math.max(1, last)) * (width - 2 * pad.x);
  const y = (place: number) =>
    pad.top + (place / Math.max(1, players.length - 1)) * (height - pad.top - pad.bottom);
  const standing = players
    .map((p) => ({ ...p, now: p.running[at]! }))
    .toSorted((a, b) => places[at]!.get(a.playerId)! - places[at]!.get(b.playerId)!);
  const [leader, second] = standing;
  const session = sessions[at]!;
  const scrub = (locationX: number) =>
    setAt(
      Math.max(0, Math.min(last, Math.round(((locationX - pad.x) / (width - 2 * pad.x)) * last))),
    );
  const headline = !second
    ? `${leader!.name} leads`
    : leader!.now === second.now
      ? `${leader!.name} and ${second.name} are tied`
      : `${leader!.name} leads by`;

  return (
    <View className="gap-4">
      <View className="gap-1">
        <Text className={cn(label, "text-board-amber")}>
          {at === last ? latest : `After session ${at + 1} of ${sessions.length}`} ·{" "}
          {where(session)}
        </Text>
        <Text
          accessibilityRole="header"
          className="font-display text-4xl leading-10 text-board-ink uppercase"
        >
          {headline}
          {second && leader!.now !== second.now ? (
            <Text className="font-mono text-3xl text-board-win">
              {" "}
              {boardMoney(leader!.now - second.now, currency, false)}
            </Text>
          ) : null}
        </Text>
        <Text className="text-sm text-board-muted">
          Session {at + 1}: {session.venue.name}, {formatDay(session.session.startedAt)}
        </Text>
      </View>

      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Replay session by session"
        accessibilityValue={{
          text: `Session ${at + 1} of ${sessions.length}, ${session.venue.name}`,
        }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) =>
          setAt((current) =>
            Math.max(
              0,
              Math.min(last, current + (event.nativeEvent.actionName === "increment" ? 1 : -1)),
            ),
          )
        }
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(event) => scrub(event.nativeEvent.locationX)}
        onResponderMove={(event) => scrub(event.nativeEvent.locationX)}
        style={{ height }}
      >
        {width > 0 ? (
          <Svg width={width} height={height} pointerEvents="none">
            {players.map((p, place) => (
              <Line
                key={p.playerId}
                x1={pad.x}
                x2={width - pad.x}
                y1={y(place)}
                y2={y(place)}
                stroke={rule}
                strokeDasharray="2 4"
              />
            ))}
            {marks.map((mark) => (
              <SvgText
                key={mark.index}
                x={x(mark.index)}
                y={height - 8}
                fill={lineColor(4)}
                fontSize={10}
                fontFamily="JetBrainsMono_500Medium"
              >
                {mark.label}
              </SvgText>
            ))}
            {players.toReversed().map((p) => {
              const points = places.map((m, i) => `${x(i)},${y(m.get(p.playerId)!)}`);
              return (
                <G key={p.playerId} stroke={lineColor(p.chip)} fill="none" strokeLinejoin="round">
                  <Polyline
                    points={points.slice(at).join(" ")}
                    strokeOpacity={0.18}
                    strokeWidth={2}
                  />
                  <Polyline
                    points={points.slice(0, at + 1).join(" ")}
                    strokeWidth={p.playerId === picked ? 4 : 2.5}
                    strokeLinecap="round"
                  />
                </G>
              );
            })}
            <Line
              x1={x(at)}
              x2={x(at)}
              y1={pad.top - 6}
              y2={height - pad.bottom + 6}
              stroke={amber}
              strokeWidth={1.5}
            />
            {players.map((p) => (
              <Circle
                key={p.playerId}
                cx={x(at)}
                cy={y(places[at]!.get(p.playerId)!)}
                r={6}
                fill={lineColor(p.chip)}
                stroke={board}
                strokeWidth={2}
              />
            ))}
          </Svg>
        ) : null}
      </View>
      <Text className="-mt-2 text-center text-xs text-board-muted">
        Drag across to replay it session by session
      </Text>

      <View className="overflow-hidden rounded-xl border border-board-rule bg-board-panel">
        {standing.map((p, place) => (
          <Pressable
            key={p.playerId}
            accessibilityRole="button"
            accessibilityState={{ selected: p.playerId === picked }}
            accessibilityLabel={`${place + 1}. ${p.name}: ${boardMoney(p.now, currency)}`}
            accessibilityHint="Shows their stats"
            onPress={() => onPick(p.playerId)}
            className={cn(
              "min-h-12 flex-row items-center gap-3 px-3 py-2.5 active:bg-board-deep",
              place > 0 && "border-t border-board-rule",
              p.playerId === picked && "border-l-[3px] border-l-board-amber",
            )}
          >
            <Text className="w-5 font-mono text-lg text-board-amber">{place + 1}</Text>
            <Chip chip={p.chip} name={p.name} size={26} />
            <View
              className="h-0.5 w-4 rounded-full"
              style={{ backgroundColor: lineColor(p.chip) }}
            />
            <Text
              numberOfLines={1}
              className="flex-1 font-display text-lg tracking-wide text-board-ink uppercase"
            >
              {p.name}
            </Text>
            <Text className={cn("font-mono text-lg", tone(p.now))}>
              {boardMoney(p.now, currency)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Sheet({
  sessions,
  player,
  rank,
  of,
  currency,
}: {
  sessions: ReadonlyArray<RaceSession>;
  player: Racer;
  rank: number;
  of: number;
  currency: GroupDetail["group"]["currency"];
}) {
  const sheet = statSheet(sessions, player.playerId)!;
  const [shown, setShown] = useState<number | null>(null);
  const track = barTrack(sheet.played.map((p) => p.net));
  const money = (n: number, signed = true) => boardMoney(n, currency, signed);
  const { runs } = sheet;
  const tiles = [
    {
      title: "Win rate",
      value: `${Math.round((runs.wins / runs.sessions) * 100)}%`,
      line: `Up in ${runs.wins} of ${runs.sessions}`,
    },
    {
      title: "Biggest hit",
      value: sheet.best ? money(sheet.best.net) : "—",
      line: sheet.best?.session.venue.name ?? "No winning session yet",
      tone: sheet.best?.net,
    },
    {
      title: "Worst beat",
      value: sheet.worst ? money(sheet.worst.net) : "—",
      line: sheet.worst?.session.venue.name ?? "Never finished down",
      tone: sheet.worst?.net,
    },
    {
      title: "Longest heater",
      value: String(runs.longestWinningRun),
      line:
        runs.current.winning && runs.current.length > 1
          ? `On ${runs.current.length} straight now`
          : "Wins in a row",
    },
    {
      title: "Best casino",
      value: sheet.bestVenue ? money(sheet.bestVenue.net) : "—",
      line: sheet.bestVenue
        ? `${sheet.bestVenue.name} · ${sheet.bestVenue.sessions} sess`
        : "Still looking",
      tone: sheet.bestVenue?.net,
    },
    {
      title: "Avg buy-in",
      value: sheet.averageBuyIn === null ? "—" : money(sheet.averageBuyIn, false),
      line: `${sheet.venues} ${sheet.venues === 1 ? "casino" : "casinos"} played`,
    },
  ];
  const focus = shown === null ? null : sheet.played[shown]!;

  return (
    <View className="gap-4">
      <View className="flex-row items-end justify-between gap-4">
        <View className="flex-1 gap-1">
          <Text className={cn(label, "text-board-amber")}>
            {player.name} · #{rank} of {of} · {runs.sessions}{" "}
            {runs.sessions === 1 ? "session" : "sessions"}
          </Text>
          <Text
            adjustsFontSizeToFit
            numberOfLines={1}
            className={cn("font-mono text-5xl", tone(sheet.total))}
          >
            {money(sheet.total)}
          </Text>
        </View>
        <Chip chip={player.chip} name={player.name} size={52} />
      </View>

      <View className="flex-row flex-wrap gap-2">
        {tiles.map((tile) => (
          <View
            key={tile.title}
            accessible
            className="basis-[48%] grow gap-1 rounded-xl border border-board-rule bg-board-panel p-3"
          >
            <Text className={cn(label, "text-board-muted")}>{tile.title}</Text>
            <Text
              adjustsFontSizeToFit
              numberOfLines={1}
              className={cn(
                "font-mono text-2xl",
                tile.tone === undefined ? "text-board-ink" : tone(tile.tone),
              )}
            >
              {tile.value}
            </Text>
            <Text numberOfLines={1} className="text-xs text-board-muted">
              {tile.line}
            </Text>
          </View>
        ))}
      </View>

      <View className="gap-2">
        <View className="flex-row items-baseline justify-between gap-3">
          <Text accessibilityRole="header" className={cn(label, "text-board-muted")}>
            Every session
          </Text>
          <Text
            accessibilityLiveRegion="polite"
            numberOfLines={1}
            className="shrink font-mono text-xs text-board-muted"
          >
            {focus
              ? `${formatDay(focus.session.session.startedAt)} · ${focus.session.venue.name} · ${money(focus.net)}`
              : "Tap a bar"}
          </Text>
        </View>
        <View className="h-36 flex-row gap-[2px] rounded-xl border border-board-rule bg-board-panel p-3">
          {sheet.played.map((p, i) => (
            <Pressable
              key={p.session.session.id}
              accessibilityLabel={`${formatDay(p.session.session.startedAt)}, ${p.session.venue.name}: ${money(p.net)}`}
              onPress={() => setShown(i)}
              className="flex-1"
            >
              <View
                className={cn(
                  "absolute inset-x-0 rounded-[2px]",
                  p.net >= 0 ? "bg-board-win" : "bg-board-loss",
                  shown !== null && shown !== i && "opacity-40",
                )}
                style={{
                  ...(p.net >= 0
                    ? { bottom: `${track.zero * 100}%` }
                    : { top: `${(1 - track.zero) * 100}%` }),
                  height: `${track.extent(p.net) * 100}%`,
                  minHeight: 2,
                }}
              />
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}
