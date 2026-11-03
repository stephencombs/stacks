import type { StaticScreenProps } from "@react-navigation/native";
import {
  GroupId,
  MinorUnits,
  type GroupDetail,
  type GroupStats,
  type PlayerResult,
} from "@stacks/contracts";
import { gameNames, playedSummary } from "@stacks/client-runtime/format";
import { seatLabel } from "@stacks/client-runtime/table";
import { Text, View } from "react-native";

import { Money } from "../components/Money";
import { Screen } from "../components/ui/Screen";
import { EmptyState, List, Row, SectionHeading, Skeleton } from "../components/ui/Surface";
import { RaceStats } from "../features/RaceStats";
import { TripHero } from "../features/TripHero";
import { Loaded, useStacks } from "../lib/stacks";

type Props = StaticScreenProps<{ groupId: string }>;

export function StatsScreen({ route }: Props) {
  const stacks = useStacks();
  const groupId = GroupId.make(route.params.groupId);
  return (
    <Screen>
      <Loaded query={stacks.group(groupId)} skeleton={<Skeleton className="h-96" />}>
        {(detail) => (
          <Loaded query={stacks.stats(groupId)} skeleton={<Skeleton className="h-64" />}>
            {(stats) => <StatsView detail={detail} stats={stats} />}
          </Loaded>
        )}
      </Loaded>
    </Screen>
  );
}

const tableNet = (results: ReadonlyArray<PlayerResult>) =>
  MinorUnits.make(results.reduce((sum, result) => sum + result.net, 0));

/** All-time: the race across every trip, a stat sheet, and the group's results by game and casino. */
function StatsView({ detail, stats }: { detail: GroupDetail; stats: GroupStats }) {
  if (stats.sessionCount === 0) {
    return (
      <EmptyState title="No finished sessions yet">
        Stats count closed sessions, so close one to see how everyone's doing.
      </EmptyState>
    );
  }
  const venues = new Map(stats.byVenue.map((row) => [row.key.id, row.key]));
  const trips = new Map(detail.trips.map((trip) => [trip.id, trip.name]));
  const sessions = stats.bySession.map((row) => ({
    session: { id: row.sessionId, startedAt: row.startedAt },
    tripId: row.tripId,
    venue: venues.get(row.venueId)!,
    results: row.results,
  }));
  const marks = sessions.flatMap((session, index) =>
    index === 0 || sessions[index - 1]!.tripId !== session.tripId
      ? [{ index, label: trips.get(session.tripId) ?? "" }]
      : [],
  );
  const currency = detail.group.currency;
  const byNet = <R extends { results: ReadonlyArray<PlayerResult> }>(rows: ReadonlyArray<R>) =>
    rows.toSorted((a, b) => tableNet(b.results) - tableNet(a.results));

  const tripCount = new Set(sessions.map((s) => s.tripId)).size;
  return (
    <>
      <Text className="text-base text-muted">
        {playedSummary(stats.sessionCount, stats.minutesPlayed)}
      </Text>
      <TripHero
        currency={detail.group.currency}
        me={detail.myPlayerId}
        sessions={sessions}
        label={`All time with ${detail.group.name}`}
        span={`${tripCount} ${tripCount === 1 ? "trip" : "trips"}`}
      />
      <View className="-mx-4">
        <RaceStats
          detail={detail}
          sessions={sessions}
          marks={marks}
          where={(session) => trips.get(session.tripId) ?? ""}
          latest="All-time"
          empty="Stats count closed sessions, so close one to see how everyone's doing."
        />
      </View>
      <View className="gap-2">
        <SectionHeading>By game</SectionHeading>
        <List>
          {byNet(stats.byGame).map((row) => (
            <Row key={row.key}>
              <Text className="flex-1 text-base text-ink">
                {gameNames[row.key]}{" "}
                <Text className="text-sm text-muted">· {row.sessionCount}</Text>
              </Text>
              <Money amount={tableNet(row.results)} currency={currency} tone="result" />
            </Row>
          ))}
        </List>
      </View>
      <View className="gap-2">
        <SectionHeading>By casino</SectionHeading>
        <List>
          {byNet(stats.byVenue).map((row) => (
            <Row key={row.key.id}>
              <Text numberOfLines={1} className="flex-1 text-base text-ink">
                {row.key.name} <Text className="text-sm text-muted">· {row.sessionCount}</Text>
              </Text>
              <Money amount={tableNet(row.results)} currency={currency} tone="result" />
            </Row>
          ))}
        </List>
      </View>
      {stats.bySeat.length > 0 ? (
        <View className="gap-2">
          <SectionHeading>By blackjack seat</SectionHeading>
          <List>
            {stats.bySeat.map((row) => (
              <Row key={row.key}>
                <Text className="flex-1 text-base text-ink">
                  {seatLabel(row.key)}{" "}
                  <Text className="text-sm text-muted">· {row.sessionCount}</Text>
                </Text>
                <Money amount={tableNet(row.results)} currency={currency} tone="result" />
              </Row>
            ))}
          </List>
        </View>
      ) : null}
    </>
  );
}
