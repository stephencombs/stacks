import {
  StackActions,
  useFocusEffect,
  useNavigation,
  type StaticScreenProps,
} from "@react-navigation/native";
import {
  SessionId,
  type Entry,
  type PlayerId,
  type SessionDetail,
  type TableId,
  type TableView,
} from "@stacks/contracts";
import { formatDay, formatTime, gameNames, playerNames } from "@stacks/client-runtime/format";
import { playerResults } from "@stacks/shared/results";
import { seatsNow } from "@stacks/shared/seats";
import * as Option from "effect/Option";
import { useCallback, type ReactNode } from "react";
import { Platform, Text, View } from "react-native";

import { Money } from "../components/Money";
import { Screen, screenError } from "../components/ui/Screen";
import { List, PageTitle, Row, SectionHeading, Tag } from "../components/ui/Surface";
import { SessionScreenSkeleton } from "../features/ScreenSkeletons";
import { Loaded, useStacks } from "../lib/stacks";

type Props = StaticScreenProps<{ sessionId: string }>;

const skeleton = (
  <Screen>
    <SessionScreenSkeleton />
  </Screen>
);

export function SessionScreen({ route }: Props) {
  const id = SessionId.makeOption(route.params.sessionId);

  if (Option.isNone(id)) return screenError("This session link is invalid.");

  return (
    <SessionData sessionId={id.value}>
      {(detail) =>
        detail.importedTableId ? (
          <ImportedLink tableId={detail.importedTableId} />
        ) : (
          <SessionReceipt detail={detail} />
        )
      }
    </SessionData>
  );
}

function ImportedLink({ tableId }: { tableId: TableId }) {
  const navigation = useNavigation();
  useFocusEffect(
    useCallback(() => {
      navigation.dispatch(StackActions.replace("Table", { tableId }));
    }, [navigation, tableId]),
  );

  return skeleton;
}

function SessionData({
  sessionId,
  children,
}: {
  sessionId: SessionId;
  children: (detail: SessionDetail) => ReactNode;
}) {
  const stacks = useStacks();

  return (
    <Loaded query={stacks.session(sessionId)} renderError={screenError} skeleton={skeleton}>
      {children}
    </Loaded>
  );
}

export function ImportedSession({
  sessionId,
  table,
  back,
}: {
  sessionId: SessionId;
  table: TableView;
  back: ReactNode;
}) {
  return (
    <SessionData sessionId={sessionId}>
      {(detail) => <SessionReceipt detail={detail} imported={table} back={back} />}
    </SessionData>
  );
}

const verbs = {
  buy_in: "Buy-in",
  cash_out: "Cash-out",
  adjustment: "Adjustment",
} satisfies Record<Entry["kind"], string>;

function SessionReceipt({
  detail,
  imported,
  back,
}: {
  detail: SessionDetail;
  imported?: TableView;
  back?: ReactNode;
}) {
  const stacks = useStacks();
  const { session, venue } = detail;
  const owners = new Map(imported?.visits.map(({ visit }) => [visit.id, visit.playerId]));

  const entries = (imported?.entries ?? detail.entries).map((entry) => ({
    ...entry,
    playerId: "playerId" in entry ? entry.playerId : owners.get(entry.visitId)!,
  }));

  const results = playerResults(entries);

  const players: ReadonlyArray<PlayerId> = imported
    ? imported.visits.map(({ visit }) => visit.playerId)
    : detail.playerIds;

  const seats = seatsNow(detail.seatings);

  return (
    <Loaded query={stacks.group(session.groupId)} renderError={screenError} skeleton={skeleton}>
      {(group) => {
        const names = playerNames(group);
        const currency = group.group.currency;

        return (
          <Screen shows={{ session: session.id }}>
            {back}
            <PageTitle
              inContent={back !== undefined || Platform.OS === "android"}
              context={`${gameNames[session.game]} · ${formatDay(session.startedAt)}`}
            >
              {venue.name}
            </PageTitle>
            <View className="flex-row items-center gap-2">
              <Tag>Read-only</Tag>
              {session.highLimit ? <Tag>High limit</Tag> : null}
              <Text className="text-sm text-muted">
                {formatTime(session.startedAt)}
                {session.endedAt ? ` to ${formatTime(session.endedAt)}` : ""}
              </Text>
            </View>
            {session.notes ? <Text className="text-sm text-ink">{session.notes}</Text> : null}
            {players.length > 0 ? (
              <View className="gap-2">
                <SectionHeading>At the table</SectionHeading>
                <List>
                  {players
                    .toSorted((a, b) => (results.get(b)?.net ?? 0) - (results.get(a)?.net ?? 0))
                    .map((id) => {
                      const result = results.get(id);
                      const seat = seats.get(id);

                      return (
                        <Row key={id}>
                          <Text className="flex-1 text-base text-ink">
                            {names.get(id) ?? "Player"}
                            {seat ? ` · Seat ${seat}` : ""}
                          </Text>
                          {result ? (
                            <Money amount={result.net} currency={currency} tone="result" />
                          ) : null}
                        </Row>
                      );
                    })}
                </List>
              </View>
            ) : null}
            {entries.length > 0 ? (
              <View className="gap-2">
                <SectionHeading>History</SectionHeading>
                <List>
                  {entries
                    .toSorted(
                      (a, b) => b.occurredAt.epochMilliseconds - a.occurredAt.epochMilliseconds,
                    )
                    .map((entry) => (
                      <Row key={entry.id}>
                        <View className="flex-1 gap-1">
                          <Text className="text-base text-ink">
                            {names.get(entry.playerId) ?? "Player"} · {verbs[entry.kind]}
                          </Text>
                          <Text className="text-sm text-muted">
                            {formatTime(entry.occurredAt)}
                            {entry.counterpartyId
                              ? ` · ${names.get(entry.counterpartyId) ?? "Player"}`
                              : ""}
                            {entry.voidedAt
                              ? ` · Voided${entry.voidReason ? ` · ${entry.voidReason}` : ""}`
                              : ""}
                          </Text>
                          {entry.note ? (
                            <Text className="text-sm text-muted">{entry.note}</Text>
                          ) : null}
                        </View>
                        <Money
                          amount={entry.amount}
                          currency={currency}
                          className={entry.voidedAt ? "line-through text-muted" : undefined}
                        />
                      </Row>
                    ))}
                </List>
              </View>
            ) : null}
          </Screen>
        );
      }}
    </Loaded>
  );
}
