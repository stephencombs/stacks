import { useNavigation } from "@react-navigation/native";
import type { GroupDetail, SessionSummary } from "@stacks/contracts";
import { formatDay, formatTime, gameNames } from "@stacks/client-runtime/format";
import { Text, View } from "react-native";

import { Money } from "../components/Money";
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
                <Text
                  numberOfLines={1}
                  className="shrink font-display text-lg tracking-wide text-ink uppercase"
                >
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
            ) : (
              <Text className="text-sm text-muted">Sat out</Text>
            )}
          </Row>
        );
      })}
    </List>
  );
}
