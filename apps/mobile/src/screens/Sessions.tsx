import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { MinorUnits, groupScope, type GroupDetail, type TripDetail } from "@stacks/contracts";
import { RECORDING_CURRENCY } from "@stacks/client-runtime/recordingView";
import {
  localClock,
  nightLabel,
  nightWeekday,
  ordinal,
  tripDates,
  tripPlays,
} from "@stacks/client-runtime/trip";
import { playerTrip, tripNights, tripStandings, type TripSession } from "@stacks/shared/trips";
import { useCallback, useState, type ReactNode } from "react";
import { Platform, View } from "react-native";
import { Text } from "../components/ui/Text";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Screen, screenError } from "../components/ui/Screen";
import { EmptyState, PageTitle, SectionHeading } from "../components/ui/Surface";
import { StartSheet } from "../features/RecordingForms";
import { SessionsSkeleton } from "../features/ScreenSkeletons";
import { SessionList } from "../features/SessionList";
import { ReopenTrip, TripOptionsButton } from "../features/TripOptions";
import { TripHero } from "../features/TripHero";
import { useGo } from "../lib/go";
import { ScopeNotices } from "../lib/realtime";
import { ScopeLoaded, usePlaceAddress } from "../lib/scope";
import { TripLoaded } from "../lib/stacks";

type Props = StaticScreenProps<{ tripId?: string } | undefined>;

/**
 * The trip: how it's going for you, who's at a table now, then its sessions and tables night by
 * night. Your own live play is the LiveBar's.
 */
export function SessionsScreen({ route }: Props) {
  usePlaceAddress(route.params, "tripId");

  return (
    <ScopeLoaded
      renderError={screenError}
      skeleton={
        <Screen>
          <SessionsSkeleton />
        </Screen>
      }
    >
      {({ trip }) =>
        trip ? (
          <ScopeNotices scopes={[groupScope(trip.groupId)]}>
            <TripLoaded
              renderError={screenError}
              tripId={trip.id}
              skeleton={
                <Screen>
                  <SessionsSkeleton />
                </Screen>
              }
            >
              {(detail, group) => <SessionsView trip={detail} group={group} />}
            </TripLoaded>
          </ScopeNotices>
        ) : null
      }
    </ScopeLoaded>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function SessionsView({ trip, group }: { trip: TripDetail; group: GroupDetail }) {
  const go = useGo();
  const navigation = useNavigation();
  const [starting, setStarting] = useState(false);
  const android = Platform.OS === "android";
  const plays = tripPlays(trip);
  const myLive = plays.some((s) => s.live && s.playing.includes(group.myPlayerId));
  const live = plays.filter((s) => s.live && (android || !s.playing.includes(group.myPlayerId)));
  const closed = plays.filter((s) => !s.live);
  const nights = tripNights(closed, localClock).toReversed();
  const going = trip.trip.endedAt === null;
  const canStart = going && group.group.currency === RECORDING_CURRENCY;

  const startButton = (
    <Button
      label="Start a session"
      variant="primary"
      size={android ? "fab" : "lg"}
      icon={android ? <Icon name="plus" color="ink-inverse" /> : undefined}
      onPress={() => setStarting(true)}
    />
  );

  const headerRight = useCallback(() => <TripActions trip={trip} group={group} />, [trip, group]);

  return (
    <Screen
      shows={{ trip: trip.trip.id }}
      contentClassName={android ? "gap-4 pt-1" : undefined}
      live={!android || !myLive}
      fab={canStart && Platform.OS === "android" ? startButton : undefined}
      renderFooter={canStart && Platform.OS !== "android" ? () => startButton : undefined}
    >
      <View className="gap-3">
        <PageTitle
          context={android ? `${group.group.name} · ${tripDates(trip.trip)}` : group.group.name}
          inContent={android}
          headerRight={android ? headerRight : undefined}
          right={android ? undefined : <TripOptionsButton trip={trip} group={group} />}
        >
          {trip.trip.name}
        </PageTitle>
        {android ? (
          <TripSummary group={group} closed={closed} nights={nights.length} />
        ) : (
          <Button
            label="Stats"
            variant="secondary"
            className="self-start"
            onPress={() => go.stats({ groupId: group.group.id, tripId: trip.trip.id })}
          />
        )}
      </View>
      {android ? null : (
        <TripHero currency={group.group.currency} me={group.myPlayerId} sessions={closed} />
      )}
      {!going ? (
        <View className="gap-3">
          <Text className="text-base text-muted">This trip has ended. Reopen it to play more.</Text>
          <ReopenTrip trip={trip} size="md" />
        </View>
      ) : null}

      {live.length > 0 ? (
        <View className="gap-2">
          {android ? null : <SectionHeading>Live now</SectionHeading>}
          <SessionList sessions={live} detail={group} />
        </View>
      ) : null}
      {nights.map((night) => {
        const played = night.sessions.flatMap((s) =>
          s.results.filter((r) => r.playerId === group.myPlayerId),
        );

        return (
          <View key={night.key} className="gap-2">
            <SectionHeading
              action={
                <Text testID="night-result" numberOfLines={1} className="shrink text-sm text-muted">
                  {played.length === 0 ? (
                    plural(night.sessions.length, "session")
                  ) : (
                    <>
                      You{" "}
                      <Money
                        amount={MinorUnits.make(played.reduce((sum, r) => sum + r.net, 0))}
                        currency={group.group.currency}
                        tone="result"
                      />
                    </>
                  )}
                </Text>
              }
            >
              {android ? nightWeekday(night) : nightLabel(night)}
            </SectionHeading>
            <SessionList sessions={night.sessions.toReversed()} detail={group} />
          </View>
        );
      })}
      {starting ? (
        <StartSheet
          initialTripId={trip.trip.id}
          onClose={() => setStarting(false)}
          onStarted={(visitId) => {
            setStarting(false);
            navigation.navigate("Play", { visitId });
          }}
          onOpened={(tableId) => {
            setStarting(false);
            navigation.navigate("Table", { tableId });
          }}
        />
      ) : null}
      {live.length === 0 && nights.length === 0 ? (
        myLive ? (
          <EmptyState centered title="You're playing now">
            Results appear here once a table finishes.
          </EmptyState>
        ) : (
          <EmptyState centered title="Nothing finished on this trip yet">
            {going
              ? "Start one when you sit down at a table. Everyone's buy-ins and cash-outs go on it."
              : "Nothing was played on this trip."}
          </EmptyState>
        )
      ) : null}
    </Screen>
  );
}

function TripActions({ trip, group }: { trip: TripDetail; group: GroupDetail }) {
  const go = useGo();

  return (
    <View className="flex-row items-center gap-2">
      <Button
        label="Stats"
        size="sm"
        onPress={() => go.stats({ groupId: group.group.id, tripId: trip.trip.id })}
      />
      <TripOptionsButton trip={trip} group={group} />
    </View>
  );
}

function TripSummary({
  group,
  closed,
  nights,
}: {
  group: GroupDetail;
  closed: ReadonlyArray<TripSession>;
  nights: number;
}) {
  const mine = playerTrip(closed, group.myPlayerId);
  const standings = tripStandings(closed, localClock);
  const rank = standings.find((standing) => standing.playerId === group.myPlayerId)?.rank;

  return (
    <View className="flex-row flex-wrap justify-between gap-x-3 gap-y-2">
      <TripStat label="You">
        <Money
          amount={MinorUnits.make(mine.net)}
          currency={group.group.currency}
          tone="result"
          className="type-heading font-bold"
        />
      </TripStat>
      <TripStat label="Sessions">{closed.length}</TripStat>
      <TripStat label="Nights">{nights}</TripStat>
      <TripStat label="Place">
        {rank === undefined ? "–" : `${ordinal(rank)} of ${standings.length}`}
      </TripStat>
    </View>
  );
}

function TripStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="gap-1">
      <Text className="type-label text-muted">{label}</Text>
      <Text className="type-heading font-bold text-ink tabular-nums">{children}</Text>
    </View>
  );
}
