import { CommonActions, useNavigation, type StaticScreenProps } from "@react-navigation/native";
import type { GroupDetail, TripDetail } from "@stacks/contracts";
import { playerNames } from "@stacks/client-runtime/format";
import { boardMoney, localClock, nightLabel } from "@stacks/client-runtime/trip";
import { tripNights } from "@stacks/shared/trips";
import { Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { cn } from "../components/ui/cn";
import { Screen } from "../components/ui/Screen";
import { EmptyState, PageTitle, SectionHeading } from "../components/ui/Surface";
import { LimitNotices } from "../features/PersonalLimits";
import { SessionsSkeleton } from "../features/ScreenSkeletons";
import { LiveSessionCard, SessionList } from "../features/SessionList";
import { ReopenTrip, TripOptionsButton } from "../features/TripOptions";
import { TripHero } from "../features/TripHero";
import { useGo } from "../lib/go";
import { ScopeLoaded, useLinkedScope, useScope } from "../lib/scope";
import { TripLoaded } from "../lib/stacks";

type Props = StaticScreenProps<{ tripId?: string } | undefined>;

/** What's being played: your live table first, then the trip, then its sessions night by night. */
export function SessionsScreen({ route }: Props) {
  const navigation = useNavigation();
  useLinkedScope(route.params, () =>
    navigation.dispatch(CommonActions.setParams({ tripId: undefined })),
  );
  const { scope } = useScope();
  // Your table comes first when it's on this trip, so the skeleton holds its place.
  const live = scope?.trip !== undefined && scope.item.mySession?.tripId === scope.trip.id;
  return (
    <Screen {...(scope?.trip ? { shows: { trip: scope.trip.id } } : {})}>
      <ScopeLoaded skeleton={<SessionsSkeleton live={live} />}>
        {({ trip }) =>
          trip ? (
            <TripLoaded tripId={trip.id} skeleton={<SessionsSkeleton live={live} />}>
              {(detail, group) => <SessionsView trip={detail} group={group} />}
            </TripLoaded>
          ) : null
        }
      </ScopeLoaded>
    </Screen>
  );
}

const tone = (n: number) => (n > 0 ? "text-win" : n < 0 ? "text-loss" : "text-muted");

function SessionsView({ trip, group }: { trip: TripDetail; group: GroupDetail }) {
  const go = useGo();
  const names = playerNames(group);
  const mine = trip.sessions.find(
    (s) => s.session.status === "live" && s.playerIds.includes(group.myPlayerId),
  );
  const live = trip.sessions.filter((s) => s.session.status === "live" && s !== mine);
  const closed = trip.sessions.filter((s) => s.session.status === "closed");
  const nights = tripNights(closed, localClock).toReversed();
  const going = trip.trip.endedAt === null;
  return (
    <>
      <View className="flex-row items-center justify-between gap-3">
        <PageTitle>Sessions</PageTitle>
        <TripOptionsButton trip={trip} group={group} />
      </View>
      <LimitNotices group={group} trip={trip} />
      {mine ? <LiveSessionCard summary={mine} detail={group} /> : null}
      <TripHero currency={group.group.currency} me={group.myPlayerId} sessions={closed} />
      {going ? (
        <Button
          label="Start a session"
          variant={mine ? "secondary" : "primary"}
          size="lg"
          onPress={() => go.newSession(trip.trip.id)}
        />
      ) : (
        <View className="gap-3">
          <Text className="text-base text-muted">This trip has ended. Reopen it to play more.</Text>
          <ReopenTrip trip={trip} size="md" />
        </View>
      )}
      {live.length > 0 ? (
        <View className="gap-2">
          <SectionHeading>{mine ? "Other live sessions" : "Live now"}</SectionHeading>
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
      {trip.sessions.length === 0 ? (
        <EmptyState title="No sessions on this trip yet">
          {going
            ? "Start one when you sit down at a table. Everyone's buy-ins and cash-outs go on it."
            : "Nothing was played on this trip."}
        </EmptyState>
      ) : null}
    </>
  );
}
