import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { MinorUnits, type GroupDetail, type TripDetail } from "@stacks/contracts";
import { RECORDING_CURRENCY } from "@stacks/client-runtime/recordingView";
import { localClock, nightLabel, tripPlays } from "@stacks/client-runtime/trip";
import { tripNights } from "@stacks/shared/trips";
import { useState } from "react";
import { Platform, Text, View } from "react-native";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function SessionsView({ trip, group }: { trip: TripDetail; group: GroupDetail }) {
  const go = useGo();
  const navigation = useNavigation();
  const [starting, setStarting] = useState(false);
  const plays = tripPlays(trip);
  const myLive = plays.some((s) => s.live && s.playing.includes(group.myPlayerId));
  const live = plays.filter((s) => s.live && !s.playing.includes(group.myPlayerId));
  const closed = plays.filter((s) => !s.live);
  const nights = tripNights(closed, localClock).toReversed();
  const going = trip.trip.endedAt === null;
  const canStart = going && group.group.currency === RECORDING_CURRENCY;
  const startButton = (
    <Button label="Start a session" variant="primary" size="lg" onPress={() => setStarting(true)} />
  );
  return (
    <Screen
      shows={{ trip: trip.trip.id }}
      fab={canStart && Platform.OS === "android" ? startButton : undefined}
      renderFooter={canStart && Platform.OS !== "android" ? () => startButton : undefined}
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
              {nightLabel(night)}
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
