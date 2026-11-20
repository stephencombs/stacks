import { useNavigation } from "@react-navigation/native";
import { useGo } from "../lib/go";
import type { GroupDetail } from "@stacks/contracts";
import { nameList } from "@stacks/client-runtime/crew";
import {
  formatDay,
  formatDuration,
  formatTime,
  gameNames,
  playerNames,
  venueLabel,
} from "@stacks/client-runtime/format";
import { chipOf, type TripPlay } from "@stacks/client-runtime/trip";
import { gameChip } from "@stacks/client-runtime/stats";
import { useRecordingClock } from "@stacks/client-runtime/recordingReact";
import type * as DateTime from "effect/DateTime";
import { useState } from "react";
import { Platform, Text, View } from "react-native";

import { Money } from "../components/Money";
import { Icon } from "../components/ui/Icon";
import { cn } from "../components/ui/cn";
import { Sheet } from "../components/ui/Sheet";
import { Badge, List, Row } from "../components/ui/Surface";
import { Chip } from "./Chip";
import { chipColor } from "./StatsParts";

function TableSummarySheet({
  play,
  detail,
  onClose,
}: {
  play: Extract<TripPlay, { kind: "table" }>;
  detail: GroupDetail;
  onClose: () => void;
}) {
  const names = playerNames(detail);
  const when = play.live
    ? `Since ${formatTime(play.startedAt)}`
    : play.endedAt
      ? `${formatDay(play.startedAt)} · ${formatTime(play.startedAt)} – ${formatTime(play.endedAt)} (${formatDuration(play.startedAt, play.endedAt)})`
      : `${formatDay(play.startedAt)} · ${formatTime(play.startedAt)}`;
  const description = [
    play.table.game ? gameNames[play.table.game] : "No game set",
    play.table.highLimit ? "High limit" : null,
    when,
  ]
    .filter(Boolean)
    .join(" · ");
  const seenGuests = new Map<string, number>();
  const guestKey = (name: string) => {
    const n = (seenGuests.get(name) ?? 0) + 1;
    seenGuests.set(name, n);
    return `guest-${name}-${n}`;
  };

  return (
    <Sheet open onClose={onClose} title={venueLabel(play.venue)} description={description}>
      {play.playerIds.length === 0 && play.others.length === 0 ? (
        <Text className="type-callout text-muted">No players recorded at this table yet.</Text>
      ) : (
        <List>
          {play.playerIds.map((playerId) => {
            const name =
              playerId === detail.myPlayerId ? "You" : (names.get(playerId) ?? "Someone");
            const isPlaying = play.playing.includes(playerId);
            const open = play.inPlay.find((item) => item.playerId === playerId);
            const result = play.results.find((item) => item.playerId === playerId);
            return (
              <Row key={playerId}>
                <Chip chip={chipOf(detail, playerId)} name={name} size={28} />
                <View className="flex-1 gap-0.5">
                  <Text numberOfLines={1} className="type-heading text-ink">
                    {name}
                  </Text>
                  {isPlaying ? (
                    <Text className="type-footnote text-muted">
                      {open && open.buyIn > 0 ? (
                        <>
                          In for <Money amount={open.buyIn} currency={detail.group.currency} />
                        </>
                      ) : (
                        "Playing"
                      )}
                    </Text>
                  ) : result ? (
                    <Text className="type-footnote text-muted">
                      In <Money amount={result.buyIn} currency={detail.group.currency} /> · Out{" "}
                      <Money amount={result.cashOut} currency={detail.group.currency} />
                    </Text>
                  ) : null}
                </View>
                {isPlaying ? (
                  <Badge tone="live">Live</Badge>
                ) : result ? (
                  <Money
                    amount={result.net}
                    currency={detail.group.currency}
                    tone="result"
                    className="type-number"
                  />
                ) : null}
              </Row>
            );
          })}
          {play.others.map((other) => (
            <Row key={guestKey(other.displayName)}>
              <View className="flex-1 gap-0.5">
                <Text numberOfLines={1} className="type-heading text-ink">
                  {other.displayName}
                </Text>
                <Text className="type-footnote text-muted">Guest</Text>
              </View>
              {other.playing ? (
                <Badge tone="live">Live</Badge>
              ) : (
                <Money
                  amount={other.net}
                  currency={detail.group.currency}
                  tone="result"
                  className="type-number"
                />
              )}
            </Row>
          ))}
        </List>
      )}
    </Sheet>
  );
}

/**
 * A trip's sessions and tables. A table opens your own visit if you played, or a read-only summary
 * if you didn't.
 */
export function SessionList({
  sessions,
  detail,
}: {
  sessions: ReadonlyArray<TripPlay>;
  detail: GroupDetail;
}) {
  const go = useGo();
  const navigation = useNavigation();
  const names = playerNames(detail);
  const [selected, setSelected] = useState<Extract<TripPlay, { kind: "table" }> | null>(null);
  const android = Platform.OS === "android";

  return (
    <>
      <List>
        {sessions.map((play) => {
          const { session, results, live } = play;
          const venue = venueLabel(play.venue);
          const game = play.kind === "session" ? play.session.game : play.table.game;
          const gameName = game ? gameNames[game] : "No game set";
          const playerCount =
            play.kind === "table" ? play.playerIds.length + play.others.length : results.length;
          const visitId = play.kind === "table" ? play.myVisitId : null;
          const open =
            play.kind === "session"
              ? () => go.session(play.session.id)
              : visitId
                ? () => navigation.navigate("Play", { visitId })
                : () => setSelected(play);
          const accessibilityHint =
            play.kind === "table" && !visitId ? "Opens the table summary" : "Opens the session";
          const mine = results.find((result) => result.playerId === detail.myPlayerId);
          // Who's still at a live table, members first.
          const who = live
            ? nameList([
                ...play.playing.map((id) =>
                  android && id === detail.myPlayerId ? "You" : (names.get(id) ?? "Someone"),
                ),
                ...(play.kind === "table"
                  ? play.others.filter((o) => o.playing).map((o) => o.displayName)
                  : []),
              ])
            : "";
          return (
            <Row key={session.id} accessibilityHint={accessibilityHint} onPress={open}>
              {android ? (
                <View className={cn("w-1 self-stretch rounded-full", chipColor[gameChip(game)])} />
              ) : (
                <Chip chip={chipOf(detail, detail.myPlayerId)} name={venue} size={28} />
              )}
              <View className="flex-1 gap-0.5">
                <View className="flex-row items-center gap-2">
                  <Text
                    numberOfLines={android ? 2 : 1}
                    className={cn("shrink type-heading text-ink", android && "font-bold")}
                  >
                    {android && game ? `${venue} · ${gameName}` : venue}
                  </Text>
                  {live && !android ? <Badge tone="live">Live</Badge> : null}
                </View>
                <Text className="type-footnote text-muted">
                  {android
                    ? live
                      ? `${who ? `${who} · ` : ""}since ${formatTime(session.startedAt)}`
                      : `${formatTime(session.startedAt)} · ${playerCount} ${playerCount === 1 ? "player" : "players"}`
                    : `${who ? `${who} · ` : ""}${gameName} · ${live ? "since " : ""}${formatTime(session.startedAt)}`}
                </Text>
              </View>
              {/* A live table's result is only its finished visits; it isn't settled yet. */}
              {android && live ? (
                <TripLiveDuration startedAt={session.startedAt} />
              ) : mine && !(live && play.kind === "table") ? (
                <Money
                  amount={mine.net}
                  currency={detail.group.currency}
                  tone="result"
                  className={cn("type-number", android && "font-bold")}
                />
              ) : null}
              {android ? <Icon name="chevron-right" color="faint" size={18} /> : null}
            </Row>
          );
        })}
      </List>
      {selected ? (
        <TableSummarySheet play={selected} detail={detail} onClose={() => setSelected(null)} />
      ) : null}
    </>
  );
}

function TripLiveDuration({ startedAt }: { startedAt: DateTime.Utc }) {
  const now = useRecordingClock();
  const duration = formatDuration(startedAt, now);
  return (
    <Text
      accessibilityLabel={`Live for ${duration}`}
      className="type-footnote font-semibold text-live"
    >
      ● {duration}
    </Text>
  );
}
