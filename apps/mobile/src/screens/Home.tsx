import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { resolveEntry, tripDates } from "@stacks/client-runtime/trip";
import { Text } from "react-native";

import { Button } from "../components/ui/Button";
import { Screen } from "../components/ui/Screen";
import { List, PageTitle, Row, Skeleton } from "../components/ui/Surface";
import type { TripTab } from "../features/tripTabConfig";
import { Loaded, useLastTrip, useStacks } from "../lib/stacks";
import { GroupsScreen } from "./Groups";
import { TripHome } from "./Trip";

/** Where the app opens: the trip that's going, or your groups when none is. */
export function HomeScreen({ route }: StaticScreenProps<{ tab?: TripTab } | undefined>) {
  const stacks = useStacks();
  const navigation = useNavigation();
  const { lastTripId } = useLastTrip();
  return (
    <Loaded query={stacks.groups} skeleton={<Skeleton className="m-4 h-40" />}>
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
                <Row key={trip.id} onPress={() => navigation.navigate("Trip", { tripId: trip.id })}>
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
  );
}
