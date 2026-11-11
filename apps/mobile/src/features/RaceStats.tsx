import type { GroupDetail, PlayerId, SessionId } from "@stacks/contracts";
import {
  around,
  barTrack,
  labelWidth,
  lineScale,
  placeLabel,
  spreadLabels,
} from "@stacks/client-runtime/chart";
import { formatDay, playerNames } from "@stacks/client-runtime/format";
import { boardMoney, chipOf, returnLabel } from "@stacks/client-runtime/trip";
import {
  raceLines,
  runningTotals,
  statSheet,
  type RaceMeasure,
  type StatsSession,
} from "@stacks/shared/stats";
import type * as DateTime from "effect/DateTime";
import { useState } from "react";
import { PanResponder, Pressable, Text, View } from "react-native";
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { Button } from "../components/ui/Button";
import { Choice } from "../components/ui/Field";
import { cn } from "../components/ui/cn";
import { Chip } from "./Chip";

const label = "text-sm";
const tone = (n: number) => (n > 0 ? "text-win" : n < 0 ? "text-loss" : "text-muted");

type Racer = { playerId: PlayerId; name: string; chip: number; running: ReadonlyArray<number> };

/** A closed session as the race sees it, oldest first. */
type RaceSession = StatsSession & {
  readonly session: { readonly id: SessionId; readonly startedAt: DateTime.Utc };
};
/** Where on the axis a stretch of sessions starts, such as a night or a trip. */
type Mark = { readonly index: number; readonly label: string };

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
      <Text className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">
        {empty}
      </Text>
    );

  const player = players.find((p) => p.playerId === picked) ?? players[0]!;
  return (
    <View className="gap-8">
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
      <PlayerSheet
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

const measures = [
  { value: "money", label: "Money" },
  { value: "return", label: "% of buy-in" },
] as const;
const HEIGHT = 168;
const PAD = { x: 16, y: 14 };

const MARKS = 22;
const MARK_FONT = 11;
const LETTER = 12;
/** Clear of the card edge, so a rounded clip can't take the first character. */
const INSET = 8;

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
  // Unpinned, the race follows the latest session, including ones that arrive while it's open.
  const [pinned, setPinned] = useState<number | null>(null);
  const at = pinned === null ? last : Math.min(pinned, last);
  const setAt = (next: number) => setPinned(next >= last ? null : next);
  const [measure, setMeasure] = useState<RaceMeasure>("money");
  const [width, setWidth] = useState(0);
  const [accent, accentText, muted, ring] = useCSSVariable([
    "--color-accent",
    "--color-accent-text",
    "--color-muted",
    "--color-line-strong",
  ]).map(String);

  const lines = raceLines(
    sessions,
    players.map((p) => p.playerId),
    measure,
  ).map((line, i) => ({ ...line, ...players[i]! }));
  const chartNames = new Map(
    players.map(({ playerId, name }) => [playerId, name.trim().split(/\s+/)[0] || name]),
  );
  const labelSpace = Math.min(
    100,
    Math.max(30, ...[...chartNames.values()].map((name) => labelWidth(name, LETTER) + 24)),
  );
  const plot = lineScale(
    lines.map((l) => l.line),
    { width: Math.max(0, width - labelSpace), height: HEIGHT },
    PAD,
    around(
      lines.findIndex((l) => l.playerId === picked),
      lines.length,
    ),
  );
  const reading = (value: number | null) =>
    measure === "money" ? boardMoney(value ?? 0, currency) : returnLabel(value);
  const standing = lines
    .map((l) => ({ ...l, now: l.values[at]! }))
    .toSorted((a, b) => (b.now ?? -Infinity) - (a.now ?? -Infinity));
  const [leader, second] = standing;
  const session = sessions[at]!;
  // Yours draws last, on top of everyone else's.
  const drawn = lines.toSorted(
    (a, b) => Number(a.playerId === picked) - Number(b.playerId === picked),
  );
  const point = at + 1;
  const labels = spreadLabels(
    drawn.map(({ line }) => plot.y(line[point]!)),
    LETTER + 6,
    { min: LETTER, max: HEIGHT - LETTER },
  );
  const edges = { min: INSET, max: Math.max(INSET, width - INSET) };
  const scrub = (locationX: number) =>
    setAt(
      Math.max(
        0,
        Math.min(
          last,
          Math.round(((locationX - PAD.x) / (width - labelSpace - 2 * PAD.x)) * (last + 1)) - 1,
        ),
      ),
    );
  // Only a sideways drag scrubs; an up-or-down swipe that starts on the chart scrolls the page.
  const drag = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) =>
      Math.abs(gesture.dx) > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderGrant: (event) => scrub(event.nativeEvent.locationX),
    onPanResponderMove: (event) => scrub(event.nativeEvent.locationX),
  });
  const lead =
    second && leader!.now !== second.now
      ? measure === "money"
        ? boardMoney(leader!.now! - second.now!, currency, false)
        : returnLabel(leader!.now)
      : null;
  const headline = !second
    ? `${leader!.name} leads`
    : lead === null
      ? `${leader!.name} and ${second.name} are tied`
      : `${leader!.name} leads ${measure === "money" ? "by" : "at"}`;

  return (
    <View className="gap-4">
      <View className="gap-1">
        <Text className={cn(label, "text-muted")}>
          {at === last ? latest : `After session ${at + 1} of ${sessions.length}`} ·{" "}
          {where(session)}
        </Text>
        <View
          accessible
          accessibilityRole="header"
          accessibilityLabel={lead === null ? headline : `${headline} ${lead}`}
          className="flex-row flex-wrap items-baseline gap-x-2"
        >
          <Text className="text-xl font-semibold text-ink">{headline}</Text>
          {lead === null ? null : (
            <Text className="font-mono text-3xl leading-10 text-win">{lead}</Text>
          )}
        </View>
        <Text className="text-sm text-muted">
          Session {at + 1}: {session.venue.name}, {formatDay(session.session.startedAt)}
        </Text>
      </View>
      <Choice
        label="Measure"
        labelHidden
        options={measures}
        value={measure}
        onChange={setMeasure}
      />

      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Replay session by session"
        accessibilityValue={{
          text: `Session ${at + 1} of ${sessions.length}, ${session.venue.name}`,
        }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) =>
          setAt(
            Math.max(
              0,
              Math.min(last, at + (event.nativeEvent.actionName === "increment" ? 1 : -1)),
            ),
          )
        }
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        {...drag.panHandlers}
        className="overflow-hidden rounded-xl bg-surface"
        style={{ height: HEIGHT + MARKS }}
      >
        {width > 0 ? (
          <Svg width={width} height={HEIGHT + MARKS} pointerEvents="none">
            <Line
              x1={0}
              x2={width - labelSpace}
              y1={plot.zero}
              y2={plot.zero}
              stroke={ring}
              strokeDasharray="3 4"
            />
            {marks.map((mark) => {
              const place = placeLabel(
                plot.x(mark.index + 1),
                labelWidth(mark.label, MARK_FONT),
                edges,
              );
              return (
                <SvgText
                  key={mark.index}
                  x={place.x}
                  y={HEIGHT + MARKS - 8}
                  textAnchor={place.anchor}
                  fill={muted}
                  fontSize={MARK_FONT}
                >
                  {mark.label}
                </SvgText>
              );
            })}
            <Line
              x1={plot.x(point)}
              x2={plot.x(point)}
              y1={PAD.y / 2}
              y2={HEIGHT - PAD.y / 2}
              stroke={ring}
            />
            {drawn.map(({ playerId, line }, i) => {
              const yours = playerId === picked;
              const color = yours ? accent : muted;
              const points = line.map((v, i) => `${plot.x(i)},${plot.y(v)}`);
              const now = { x: plot.x(point), y: plot.y(line[point]!) };
              const off = plot.clipped(line[point]!);
              const chartName =
                chartNames.get(playerId)! + (off === 1 ? " ↑" : off === -1 ? " ↓" : "");
              const seatWidth = labelWidth(chartName, LETTER);
              const seat = placeLabel(now.x + 9 + seatWidth / 2, seatWidth, edges);
              return (
                <G key={playerId}>
                  <Polyline
                    points={points.slice(point).join(" ")}
                    fill="none"
                    stroke={color}
                    strokeOpacity={0.15}
                    strokeWidth={2}
                    strokeLinejoin="round"
                  />
                  <Polyline
                    points={points.slice(0, point + 1).join(" ")}
                    fill="none"
                    stroke={color}
                    strokeOpacity={yours ? 1 : 0.45}
                    strokeWidth={yours ? 3 : 2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {yours ? (
                    <Circle cx={now.x} cy={now.y} r={10} fill={color} fillOpacity={0.2} />
                  ) : null}
                  <Circle cx={now.x} cy={now.y} r={yours ? 4.5 : 3} fill={color} />
                  <SvgText
                    x={seat.x}
                    y={labels[i]! + 4}
                    textAnchor={seat.anchor}
                    fontSize={LETTER}
                    fontWeight={yours ? "600" : "400"}
                    fill={yours ? accentText : muted}
                  >
                    {chartName}
                  </SvgText>
                </G>
              );
            })}
          </Svg>
        ) : null}
      </View>

      <View className="overflow-hidden rounded-xl border border-line bg-surface">
        {standing.map((p, place) => (
          <Pressable
            key={p.playerId}
            accessibilityRole="button"
            accessibilityState={{ selected: p.playerId === picked }}
            accessibilityLabel={`${place + 1}. ${p.name}: ${reading(p.now)}`}
            accessibilityHint="Shows their stats"
            onPress={() => onPick(p.playerId)}
            className={cn(
              "min-h-12 flex-row items-center gap-3 px-3 py-2.5 active:bg-sunken",
              place > 0 && "border-t border-line",
              p.playerId === picked && "border-l-[3px] border-l-accent",
            )}
          >
            <Text className="min-w-6 text-center font-mono text-lg leading-7 text-muted">
              {place + 1}
            </Text>
            <Chip chip={p.chip} name={p.name} size={26} />
            <Text numberOfLines={1} className="flex-1 text-base font-medium text-ink">
              {p.name}
            </Text>
            <Text className={cn("font-mono text-lg leading-7", tone(p.now ?? 0))}>
              {reading(p.now)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** One player's stat sheet: their total, six tiles, and a bar for every session. */
export function PlayerSheet({
  sessions,
  player,
  rank,
  of,
  currency,
}: {
  sessions: ReadonlyArray<RaceSession>;
  player: Pick<Racer, "playerId" | "name" | "chip">;
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
        ? `${sheet.bestVenue.name} · ${sheet.bestVenue.sessions} ${sheet.bestVenue.sessions === 1 ? "session" : "sessions"}`
        : "Still looking",
      tone: sheet.bestVenue?.net,
    },
    {
      title: "Avg buy-in",
      value: sheet.averageBuyIn === null ? "—" : money(sheet.averageBuyIn, false),
      line: "Per session with a buy-in, including rebuys",
    },
  ];
  const selectedSession = Math.min(shown ?? sheet.played.length - 1, sheet.played.length - 1);
  const focus = sheet.played[selectedSession]!;

  return (
    <View className="gap-4">
      <View className="flex-row items-end justify-between gap-4">
        <View className="flex-1 gap-1">
          <Text className={cn(label, "text-muted")}>
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
            className="basis-[48%] grow gap-1 rounded-xl border border-line bg-surface p-3"
          >
            <Text className={cn(label, "text-muted")}>{tile.title}</Text>
            <Text
              adjustsFontSizeToFit
              numberOfLines={1}
              className={cn(
                "font-mono text-2xl",
                tile.tone === undefined ? "text-ink" : tone(tile.tone),
              )}
            >
              {tile.value}
            </Text>
            <Text numberOfLines={1} className="text-xs text-muted">
              {tile.line}
            </Text>
          </View>
        ))}
      </View>

      <View className="gap-2">
        <Text accessibilityRole="header" className="text-lg font-semibold text-ink">
          Every session
        </Text>
        <Text accessibilityLiveRegion="polite" className="type-footnote text-muted">
          Session {selectedSession + 1} of {sheet.played.length} ·{" "}
          {formatDay(focus.session.session.startedAt)}
          {"\n"}
          {focus.session.venue.name} · {money(focus.net)}
        </Text>
        <View className="flex-row gap-2">
          <Button
            label="Previous"
            accessibilityLabel={`Previous session for ${player.name}`}
            className="flex-1"
            disabled={selectedSession === 0}
            onPress={() => setShown(selectedSession - 1)}
          />
          <Button
            label="Next"
            accessibilityLabel={`Next session for ${player.name}`}
            className="flex-1"
            disabled={selectedSession === sheet.played.length - 1}
            onPress={() => setShown(selectedSession + 1)}
          />
        </View>
        <View className="h-36 flex-row gap-[2px] rounded-xl border border-line bg-surface p-3">
          {sheet.played.map((p, i) => (
            <Pressable
              key={p.session.session.id}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedSession === i }}
              accessibilityLabel={`Session ${i + 1} of ${sheet.played.length}, ${formatDay(p.session.session.startedAt)}, ${p.session.venue.name}: ${money(p.net)}`}
              onPress={() => setShown(i)}
              className="flex-1"
            >
              <View
                className={cn(
                  "absolute inset-x-0 rounded-[2px]",
                  p.net > 0 ? "bg-win" : p.net < 0 ? "bg-loss" : "bg-muted",
                  selectedSession !== i && "opacity-40",
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
