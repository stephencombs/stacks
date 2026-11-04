import { CommonActions, useNavigation, type StaticScreenProps } from "@react-navigation/native";

import { Choice } from "../components/ui/Field";
import { Screen } from "../components/ui/Screen";
import { PageTitle } from "../components/ui/Surface";
import { AllTimeBoard } from "../features/AllTimeBoard";
import { AllTimeSkeleton, BoardSkeleton } from "../features/ScreenSkeletons";
import { TripBoard } from "../features/TripBoard";
import { ScopeLoaded, usePlaceAddress } from "../lib/scope";
import { TripLoaded } from "../lib/stacks";

type Props = StaticScreenProps<
  { tripId?: string; groupId?: string; scope?: "trip" | "all" } | undefined
>;

const views = [
  { value: "trip", label: "This trip" },
  { value: "all", label: "All time" },
] as const;

/** Who's winning: the trip in scope, or everything the group has played. */
export function BoardScreen({ route }: Props) {
  const navigation = useNavigation();
  const params = route.params;
  // `?scope=all` is All time, as on web. A group's old Stats address names only the group, and
  // meant all time.
  const view = params?.scope ?? (params?.groupId ? "all" : "trip");
  usePlaceAddress(params, "tripId");
  return (
    <Screen>
      <PageTitle>Board</PageTitle>
      <Choice
        label="Show"
        labelHidden
        options={views}
        value={view}
        onChange={(next) =>
          navigation.dispatch(
            CommonActions.setParams({
              scope: next === "all" ? next : undefined,
              groupId: undefined,
            }),
          )
        }
      />
      <ScopeLoaded skeleton={view === "all" ? <AllTimeSkeleton /> : <BoardSkeleton />}>
        {({ item, trip }) =>
          view === "all" ? (
            <AllTimeBoard groupId={item.group.id} />
          ) : trip ? (
            <TripLoaded tripId={trip.id} skeleton={<BoardSkeleton />}>
              {(detail, group) => <TripBoard detail={group} trip={detail} />}
            </TripLoaded>
          ) : null
        }
      </ScopeLoaded>
    </Screen>
  );
}
