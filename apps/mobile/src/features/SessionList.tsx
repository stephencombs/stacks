import { useNavigation } from "@react-navigation/native";
import { useGo } from "../lib/go";
import type { GroupDetail, SessionSummary } from "@stacks/contracts";
import { formatDuration, formatTime, gameNames, venueLabel } from "@stacks/client-runtime/format";
import { chipOf, type TripPlay } from "@stacks/client-runtime/trip";
import * as DateTime from "effect/DateTime";
import { Text, View } from "react-native";

import { Money } from "../components/Money";
import { Badge, Card, List, Row } from "../components/ui/Surface";
import { Chip } from "./Chip";

/**
 * A trip's sessions and tables. A table opens your own visit there; one you didn't play has no
 * screen yet.
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
  return (
    <List>
      {sessions.map((play) => {
        const { session, results, live } = play;
        const venue = venueLabel(play.venue);
        const game =
          play.kind === "session"
            ? gameNames[play.session.game]
            : play.table.game
              ? gameNames[play.table.game]
              : "No game set";
        const visitId = play.kind === "table" ? play.myVisitId : null;
        const open =
          play.kind === "session"
            ? () => go.session(play.session.id)
            : visitId
              ? () => navigation.navigate("Play", { visitId })
              : undefined;
        const mine = results.find((result) => result.playerId === detail.myPlayerId);
        return (
          <Row
            key={session.id}
            {...(open ? { accessibilityHint: "Opens the session", onPress: open } : {})}
          >
            <Chip chip={chipOf(detail, detail.myPlayerId)} name={venue} size={28} />
            <View className="flex-1 gap-0.5">
              <View className="flex-row items-center gap-2">
                <Text numberOfLines={1} className="shrink type-heading text-ink">
                  {venue}
                </Text>
                {live ? <Badge tone="live">Live</Badge> : null}
              </View>
              <Text className="type-footnote text-muted">
                {game} · {live ? "since " : ""}
                {formatTime(session.startedAt)}
              </Text>
            </View>
            {mine ? (
              <Money
                amount={mine.net}
                currency={detail.group.currency}
                tone="result"
                className="type-number"
              />
            ) : null}
          </Row>
        );
      })}
    </List>
  );
}

export function LiveSessionCard({
  summary,
  detail,
}: {
  summary: SessionSummary;
  detail: GroupDetail;
}) {
  const { session, venue, results, playing } = summary;
  const mine = results.find((result) => result.playerId === detail.myPlayerId);
  return (
    <Card className="gap-4 p-5">
      <View className="flex-row items-center justify-between gap-3">
        <Badge tone="live">{`Live · ${formatDuration(session.startedAt, DateTime.nowUnsafe())}`}</Badge>
        <Text className="type-footnote text-muted">since {formatTime(session.startedAt)}</Text>
      </View>
      <View className="flex-row items-end justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text accessibilityRole="header" numberOfLines={1} className="type-title text-ink">
            {venue.name}
          </Text>
          <Text className="type-footnote text-muted">
            {gameNames[session.game]} · {playing.length} at the table
          </Text>
        </View>
        {mine && mine.buyIn > 0 ? (
          <View className="items-end gap-1">
            <Text className="type-label text-muted">In play</Text>
            <Money
              amount={mine.buyIn}
              currency={detail.group.currency}
              className="type-number-lg"
            />
          </View>
        ) : null}
      </View>
    </Card>
  );
}
