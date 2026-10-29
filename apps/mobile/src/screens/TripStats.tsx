import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { TripId } from "@stacks/contracts";
import { useLayoutEffect } from "react";
import { ScrollView } from "react-native";
import { useCSSVariable } from "uniwind";

import { Skeleton } from "../components/ui/Surface";
import { TripStats } from "../features/RaceStats";
import { Loaded, useStacks } from "../lib/stacks";

type Props = StaticScreenProps<{ tripId: string }>;

export function TripStatsScreen({ route }: Props) {
  const stacks = useStacks();
  const navigation = useNavigation();
  const [board, ink] = useCSSVariable(["--color-board", "--color-board-ink"]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerStyle: { backgroundColor: String(board) },
      headerTintColor: String(ink),
    });
  }, [navigation, board, ink]);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-board">
      <Loaded
        query={stacks.trip(TripId.make(route.params.tripId))}
        skeleton={<Skeleton className="m-4 h-96" />}
      >
        {(trip) => (
          <Loaded
            query={stacks.group(trip.trip.groupId)}
            skeleton={<Skeleton className="m-4 h-96" />}
          >
            {(group) => <TripStats detail={group} trip={trip} />}
          </Loaded>
        )}
      </Loaded>
    </ScrollView>
  );
}
