import { useNavigation } from "@react-navigation/native";
import { useGo } from "../lib/go";
import type { GroupDetail } from "@stacks/contracts";
import { nameList } from "@stacks/client-runtime/crew";
import { formatTime, gameNames, playerNames, venueLabel } from "@stacks/client-runtime/format";
import { chipOf, type TripPlay } from "@stacks/client-runtime/trip";
import { Text, View } from "react-native";

import { Money } from "../components/Money";
import { Badge, List, Row } from "../components/ui/Surface";
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
  const names = playerNames(detail);
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
        // Who's still at a live table, members first.
        const who = live
          ? nameList([
              ...play.playing.map((id) => names.get(id) ?? "Someone"),
              ...(play.kind === "table"
                ? play.others.filter((o) => o.playing).map((o) => o.displayName)
                : []),
            ])
          : "";
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
                {who ? `${who} · ` : ""}
                {game} · {live ? "since " : ""}
                {formatTime(session.startedAt)}
              </Text>
            </View>
            {/* A live table's result is only its finished visits; it isn't settled yet. */}
            {mine && !(live && play.kind === "table") ? (
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
