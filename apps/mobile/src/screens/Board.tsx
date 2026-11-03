import { CommonActions, useNavigation, type StaticScreenProps } from "@react-navigation/native";

import { Choice } from "../components/ui/Field";
import { Screen } from "../components/ui/Screen";
import { PageTitle } from "../components/ui/Surface";
import { AllTimeBoard } from "../features/AllTimeBoard";
import { AllTimeSkeleton, BoardSkeleton } from "../features/ScreenSkeletons";
import { TripBoard } from "../features/TripBoard";
import { ScopeLoaded, useLinkedScope } from "../lib/scope";
import { TripLoaded } from "../lib/stacks";

type View = "trip" | "all";
type Props = StaticScreenProps<{ tripId?: string; groupId?: string; view?: View } | undefined>;

const views = [
  { value: "trip", label: "This trip" },
  { value: "all", label: "All time" },
] as const;

/** Who's winning: the trip in scope, or everything the group has played. */
export function BoardScreen({ route }: Props) {
  const navigation = useNavigation();
  const params = route.params;
  // A group's old Stats address names only the group, and meant all time.
  const view = params?.view ?? (params?.groupId && !params.tripId ? "all" : "trip");
  useLinkedScope(params);
  return (
    <Screen>
      <PageTitle>Board</PageTitle>
      <Choice
        label="Show"
        labelHidden
        options={views}
        value={view}
        onChange={(next) => navigation.dispatch(CommonActions.setParams({ view: next }))}
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
