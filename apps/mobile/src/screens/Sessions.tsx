import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import type { GroupDetail, TripDetail } from "@stacks/contracts";
import { playerNames } from "@stacks/client-runtime/format";
import { RECORDING_CURRENCY } from "@stacks/client-runtime/recordingView";
import { boardMoney, localClock, nightLabel, tripPlays } from "@stacks/client-runtime/trip";
import { tripNights } from "@stacks/shared/trips";
import { useState } from "react";
import { Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { cn } from "../components/ui/cn";
import { Screen, screenError } from "../components/ui/Screen";
import { EmptyState, PageTitle, SectionHeading } from "../components/ui/Surface";
import { StartSheet } from "../features/RecordingForms";
import { SessionsSkeleton } from "../features/ScreenSkeletons";
import { SessionList } from "../features/SessionList";
import { ReopenTrip, TripOptionsButton } from "../features/TripOptions";
import { TripHero } from "../features/TripHero";
import { useGo } from "../lib/go";
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
        ) : null
      }
    </ScopeLoaded>
  );
}

const tone = (n: number) => (n > 0 ? "text-win" : n < 0 ? "text-loss" : "text-muted");

function SessionsView({ trip, group }: { trip: TripDetail; group: GroupDetail }) {
  const go = useGo();
  const navigation = useNavigation();
  const [starting, setStarting] = useState(false);
  const names = playerNames(group);
  const plays = tripPlays(trip);
  const live = plays.filter((s) => s.live && !s.playing.includes(group.myPlayerId));
  const closed = plays.filter((s) => !s.live);
  const nights = tripNights(closed, localClock).toReversed();
  const going = trip.trip.endedAt === null;
  const canStart = going && group.group.currency === RECORDING_CURRENCY;
  return (
    <Screen
      shows={{ trip: trip.trip.id }}
      renderFooter={
        canStart
          ? () => (
              <Button
                label="Start a session"
                variant="primary"
                size="lg"
                onPress={() => setStarting(true)}
              />
            )
          : undefined
      }
    >
      <View className="gap-3">
        <PageTitle
          context={group.group.name}
          right={<TripOptionsButton trip={trip} group={group} />}
        >
          {trip.trip.name}
        </PageTitle>
        <Button
          label="Stats"
          variant="secondary"
          className="self-start"
          onPress={() => go.stats({ groupId: group.group.id, tripId: trip.trip.id })}
        />
      </View>
      <TripHero currency={group.group.currency} me={group.myPlayerId} sessions={closed} />
      {!going ? (
        <View className="gap-3">
          <Text className="text-base text-muted">This trip has ended. Reopen it to play more.</Text>
          <ReopenTrip trip={trip} size="md" />
        </View>
      ) : null}

      {live.length > 0 ? (
        <View className="gap-2">
          <SectionHeading>Live now</SectionHeading>
          <SessionList sessions={live} detail={group} />
        </View>
      ) : null}
      {nights.map((night) => (
        <View key={night.key} className="gap-2">
          <SectionHeading
            action={
              night.winner ? (
                <Text numberOfLines={1} className="shrink text-sm text-muted">
                  {names.get(night.winner.playerId) ?? "Someone"}{" "}
                  <Text className={cn("font-mono", tone(night.winner.net))}>
                    {boardMoney(night.winner.net, group.group.currency)}
                  </Text>
                </Text>
              ) : undefined
            }
          >
            {nightLabel(night)}
          </SectionHeading>
          <SessionList sessions={night.sessions.toReversed()} detail={group} />
        </View>
      ))}
      {starting ? (
        <StartSheet
          initialTripId={trip.trip.id}
          onClose={() => setStarting(false)}
          onStarted={(visitId) => {
            setStarting(false);
            navigation.navigate("Play", { visitId });
          }}
        />
      ) : null}
      {live.length === 0 && nights.length === 0 ? (
        <EmptyState centered title="Nothing finished on this trip yet">
          {going
            ? "Start one when you sit down at a table. Everyone's buy-ins and cash-outs go on it."
            : "Nothing was played on this trip."}
        </EmptyState>
      ) : null}
    </Screen>
  );
}
