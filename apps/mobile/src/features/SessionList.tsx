import { useGo } from "../lib/go";
import type { GroupDetail, SessionSummary } from "@stacks/contracts";
import { formatDuration, formatTime, gameNames } from "@stacks/client-runtime/format";
import { chipOf } from "@stacks/client-runtime/trip";
import * as DateTime from "effect/DateTime";
import { Text, View } from "react-native";

import { Money } from "../components/Money";
import { Badge, Card, List, Row } from "../components/ui/Surface";
import { Chip } from "./Chip";

export function SessionList({
  sessions,
  detail,
}: {
  sessions: ReadonlyArray<SessionSummary>;
  detail: GroupDetail;
}) {
  const go = useGo();
  return (
    <List>
      {sessions.map(({ session, venue, results }) => {
        const mine = results.find((result) => result.playerId === detail.myPlayerId);
        return (
          <Row
            key={session.id}
            accessibilityHint="Opens the session"
            onPress={() => go.session(session.id)}
          >
            <Chip chip={chipOf(detail, detail.myPlayerId)} name={venue.name} size={28} />
            <View className="flex-1 gap-0.5">
              <View className="flex-row items-center gap-2">
                <Text numberOfLines={1} className="shrink type-heading text-ink">
                  {venue.name}
                </Text>
                {session.status === "live" ? <Badge tone="live">Live</Badge> : null}
              </View>
              <Text className="type-footnote text-muted">
                {gameNames[session.game]} · {session.status === "live" ? "since " : ""}
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
