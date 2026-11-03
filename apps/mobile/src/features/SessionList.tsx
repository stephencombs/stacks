import { useNavigation } from "@react-navigation/native";
import type { GroupDetail, SessionSummary } from "@stacks/contracts";
import { formatDay, formatDuration, formatTime, gameNames } from "@stacks/client-runtime/format";
import * as DateTime from "effect/DateTime";
import { Text, View } from "react-native";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { Glow } from "../components/ui/Glow";
import { List, Row, Tag } from "../components/ui/Surface";

export function SessionList({
  sessions,
  detail,
}: {
  sessions: ReadonlyArray<SessionSummary>;
  detail: GroupDetail;
}) {
  const navigation = useNavigation();
  return (
    <List>
      {sessions.map(({ session, venue, results }) => {
        const mine = results.find((result) => result.playerId === detail.myPlayerId);
        return (
          <Row
            key={session.id}
            accessibilityHint="Opens the session"
            onPress={() => navigation.navigate("Session", { sessionId: session.id })}
          >
            <View className="flex-1 gap-0.5">
              <View className="flex-row items-center gap-2">
                <Text numberOfLines={1} className="shrink text-base font-medium text-ink">
                  {venue.name}
                </Text>
                {session.status === "live" ? <Tag tone="live">Live</Tag> : null}
              </View>
              <Text className="text-sm text-muted">
                {gameNames[session.game]} · {formatDay(session.startedAt)}
                {session.status === "live" ? ` · since ${formatTime(session.startedAt)}` : ""}
              </Text>
            </View>
            {mine ? (
              <Money
                amount={mine.net}
                currency={detail.group.currency}
                tone="result"
                className="text-base"
              />
            ) : null}
          </Row>
        );
      })}
    </List>
  );
}

/** Your live session, one tap from the table: where, how long, and what you have in play. */
export function LiveSessionCard({
  summary,
  detail,
}: {
  summary: SessionSummary;
  detail: GroupDetail;
}) {
  const navigation = useNavigation();
  const { session, venue, results, playing } = summary;
  const mine = results.find((result) => result.playerId === detail.myPlayerId);
  return (
    <View className="overflow-hidden rounded-xl bg-surface">
      <Glow tone="accent" />
      <View className="gap-4 p-4">
        <View className="flex-row items-center justify-between gap-3">
          <Tag tone="live">{`Live · ${formatDuration(session.startedAt, DateTime.nowUnsafe())}`}</Tag>
          <Text className="text-sm text-muted">since {formatTime(session.startedAt)}</Text>
        </View>
        <View className="flex-row items-end justify-between gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              className="font-display text-3xl text-ink uppercase"
            >
              {venue.name}
            </Text>
            <Text className="text-sm text-muted">
              {gameNames[session.game]} · {playing.length} at the table
            </Text>
          </View>
          {mine && mine.buyIn > 0 ? (
            <View className="items-end gap-1">
              <Text className="text-sm text-muted">In play</Text>
              <Money amount={mine.buyIn} currency={detail.group.currency} className="text-2xl" />
            </View>
          ) : null}
        </View>
        <Button
          label="Back to the table"
          variant="primary"
          size="lg"
          onPress={() => navigation.navigate("Session", { sessionId: session.id })}
        />
      </View>
    </View>
  );
}
