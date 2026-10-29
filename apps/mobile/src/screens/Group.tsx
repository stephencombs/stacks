import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { GroupId, type GroupDetail } from "@stacks/contracts";
import { View } from "react-native";

import { Button } from "../components/ui/Button";
import { Screen } from "../components/ui/Screen";
import { PageTitle, Skeleton } from "../components/ui/Surface";
import { TripsSection } from "../features/Trips";
import { Loaded, useStacks } from "../lib/stacks";

type Props = StaticScreenProps<{ groupId: string }>;

export function GroupScreen({ route }: Props) {
  const stacks = useStacks();
  return (
    <Screen>
      <Loaded
        query={stacks.group(GroupId.make(route.params.groupId))}
        skeleton={<Skeleton className="h-96" />}
      >
        {(detail) => <GroupView detail={detail} />}
      </Loaded>
    </Screen>
  );
}

function GroupView({ detail }: { detail: GroupDetail }) {
  const navigation = useNavigation();
  const groupId = detail.group.id;
  // Trips come newest first, so the first one still going is where tonight's sessions go.
  const going = detail.trips.find((trip) => trip.endedAt === null);

  return (
    <>
      <PageTitle
        eyebrow={`${detail.players.length} ${detail.players.length === 1 ? "player" : "players"} · ${detail.group.currency}`}
      >
        {detail.group.name}
      </PageTitle>
      {going ? (
        <Button
          label={`Start a session in ${going.name}`}
          variant="primary"
          size="lg"
          onPress={() => navigation.navigate("NewSession", { tripId: going.id })}
        />
      ) : null}
      <View className="flex-row gap-2">
        <Button
          label="Stats"
          size="sm"
          className="flex-1"
          onPress={() => navigation.navigate("Stats", { groupId })}
        />
        <Button
          label="People"
          size="sm"
          className="flex-1"
          onPress={() => navigation.navigate("People", { groupId })}
        />
      </View>

      <TripsSection detail={detail} />
    </>
  );
}
