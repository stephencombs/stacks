import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { resolveEntry, tripDates } from "@stacks/client-runtime/trip";
import { Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { Screen } from "../components/ui/Screen";
import { List, PageTitle, Row } from "../components/ui/Surface";
import type { TripTab } from "../features/tripTabConfig";
import { Loaded, Prefetch, useLastTrip, useStacks } from "../lib/stacks";
import { GroupsScreen } from "./Groups";
import { TripHome } from "./Trip";
import { ListScreenSkeleton, TripScreenSkeleton } from "../features/ScreenSkeletons";

/** Where the app opens: the trip that's going, or your groups when none is. */
export function HomeScreen({ route }: StaticScreenProps<{ tab?: TripTab } | undefined>) {
  const stacks = useStacks();
  const navigation = useNavigation();
  const { lastTripId } = useLastTrip();
  // Most launches land on the last trip, so wait in its shape and start loading it now.
  return (
    <>
      {lastTripId ? (
        <>
          <Prefetch query={stacks.trip(lastTripId)} />
          <Prefetch query={stacks.limits(lastTripId)} />
        </>
      ) : null}
      <Loaded
        query={stacks.groups}
        skeleton={
          lastTripId ? (
            <TripScreenSkeleton tab={route.params?.tab ?? "table"} />
          ) : (
            <View className="flex-1 bg-canvas p-4">
              <ListScreenSkeleton label="Loading your groups" rows={3} />
            </View>
          )
        }
      >
        {(groups) => {
          const entry = resolveEntry(groups, lastTripId);
          if (entry.kind === "trip")
            return <TripHome tripId={entry.tripId} tab={route.params?.tab} />;
          if (entry.kind === "groups") return <GroupsScreen />;
          return (
            <Screen>
              <PageTitle context="More than one trip is going right now.">Choose a trip</PageTitle>
              <List>
                {entry.trips.map(({ group, trip }) => (
                  <Row
                    key={trip.id}
                    onPress={() => navigation.navigate("Trip", { tripId: trip.id })}
                  >
                    <Text className="flex-1 text-base text-ink">{trip.name}</Text>
                    <Text className="text-sm text-muted">
                      {group.name} · {tripDates(trip)}
                    </Text>
                  </Row>
                ))}
              </List>
              <Button label="Your groups" onPress={() => navigation.navigate("Groups")} />
            </Screen>
          );
        }}
      </Loaded>
    </>
  );
}
