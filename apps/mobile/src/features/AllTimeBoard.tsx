import {
  MinorUnits,
  type GroupDetail,
  type GroupId,
  type GroupStats,
  type PlayerResult,
} from "@stacks/contracts";
import { gameNames, playedSummary } from "@stacks/client-runtime/format";
import { seatLabel } from "@stacks/client-runtime/table";
import { Text, View } from "react-native";

import { Money } from "../components/Money";
import { EmptyState, List, ProportionalBarRow, SectionHeading } from "../components/ui/Surface";
import { Loaded, Prefetch, useStacks } from "../lib/stacks";
import { RaceStats } from "./RaceStats";
import { AllTimeSkeleton } from "./ScreenSkeletons";
import { TripHero } from "./TripHero";

/** The Board across every trip: what the group's Stats page used to show. */
export function AllTimeBoard({ groupId }: { groupId: GroupId }) {
  const stacks = useStacks();
  return (
    <>
      <Prefetch query={stacks.stats(groupId)} />
      <Loaded query={stacks.group(groupId)} skeleton={<AllTimeSkeleton />}>
        {(detail) => (
          <Loaded query={stacks.stats(groupId)} skeleton={<AllTimeSkeleton />}>
            {(stats) => <StatsView detail={detail} stats={stats} />}
          </Loaded>
        )}
      </Loaded>
    </>
  );
}

const tableNet = (results: ReadonlyArray<PlayerResult>) =>
  MinorUnits.make(results.reduce((sum, result) => sum + result.net, 0));

/** All-time: the race across every trip, a stat sheet, and the group's results by game and casino. */
function StatsView({ detail, stats }: { detail: GroupDetail; stats: GroupStats }) {
  if (stats.sessionCount === 0) {
    return (
      <EmptyState title="No finished sessions yet" centered>
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
      <RaceStats
        detail={detail}
        sessions={sessions}
        marks={marks}
        where={(session) => trips.get(session.tripId) ?? ""}
        latest="All-time"
        empty="Stats count closed sessions, so close one to see how everyone's doing."
      />
      <View className="gap-2">
        <SectionHeading>By game</SectionHeading>
        <List>
          {byNet(stats.byGame).map((row) => {
            const net = tableNet(row.results);
            const share = row.sessionCount / Math.max(1, stats.sessionCount);
            return (
              <ProportionalBarRow
                key={row.key}
                title={gameNames[row.key]}
                right={
                  <Money amount={net} currency={currency} tone="result" className="type-number" />
                }
                share={share}
                tone={net > 0 ? "win" : net < 0 ? "loss" : "accent"}
                subtitle={`${Math.round(share * 100)}% of sessions · ${row.sessionCount} ${row.sessionCount === 1 ? "session" : "sessions"}`}
              />
            );
          })}
        </List>
      </View>
      <View className="gap-2">
        <SectionHeading>By casino</SectionHeading>
        <List>
          {byNet(stats.byVenue).map((row) => {
            const net = tableNet(row.results);
            const share = row.sessionCount / Math.max(1, stats.sessionCount);
            return (
              <ProportionalBarRow
                key={row.key.id}
                title={row.key.name}
                right={
                  <Money amount={net} currency={currency} tone="result" className="type-number" />
                }
                share={share}
                tone={net > 0 ? "win" : net < 0 ? "loss" : "accent"}
                subtitle={`${Math.round(share * 100)}% of sessions · ${row.sessionCount} ${row.sessionCount === 1 ? "session" : "sessions"}`}
              />
            );
          })}
        </List>
      </View>
      {stats.bySeat.length > 0 ? (
        <View className="gap-2">
          <SectionHeading>By blackjack seat</SectionHeading>
          <List>
            {stats.bySeat.map((row) => {
              const net = tableNet(row.results);
              const share = row.sessionCount / Math.max(1, stats.sessionCount);
              return (
                <ProportionalBarRow
                  key={row.key}
                  title={seatLabel(row.key)}
                  right={
                    <Money amount={net} currency={currency} tone="result" className="type-number" />
                  }
                  share={share}
                  tone={net > 0 ? "win" : net < 0 ? "loss" : "accent"}
                  subtitle={`${Math.round(share * 100)}% of sessions · ${row.sessionCount} ${row.sessionCount === 1 ? "session" : "sessions"}`}
                />
              );
            })}
          </List>
        </View>
      ) : null}
    </>
  );
}
