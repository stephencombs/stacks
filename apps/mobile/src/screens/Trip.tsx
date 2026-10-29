import { useAuth } from "@clerk/expo";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { TripId, type GroupDetail, type TripDetail } from "@stacks/contracts";
import { isAdmin } from "@stacks/client-runtime/format";
import { useLayoutEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useCSSVariable } from "uniwind";

import { Button } from "../components/ui/Button";
import { FormError } from "../components/ui/Field";
import { Sheet } from "../components/ui/Sheet";
import { Skeleton } from "../components/ui/Surface";
import { TripBoard } from "../features/TripBoard";
import { Loaded, useAction, useStacks } from "../lib/stacks";

type Props = StaticScreenProps<{ tripId: string }>;

export function TripScreen({ route }: Props) {
  const stacks = useStacks();
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
            {(group) => <TripView trip={trip} group={group} />}
          </Loaded>
        )}
      </Loaded>
    </ScrollView>
  );
}

function TripView({ trip, group }: { trip: TripDetail; group: GroupDetail }) {
  const navigation = useNavigation();
  const [board, ink] = useCSSVariable(["--color-board", "--color-board-ink"]);
  const [options, setOptions] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: trip.trip.name,
      headerStyle: { backgroundColor: String(board) },
      headerTintColor: String(ink),
    });
  }, [navigation, trip.trip.name, board, ink]);

  return (
    <>
      <View className="flex-row justify-end bg-board px-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Actions for ${trip.trip.name}`}
          onPress={() => setOptions(true)}
          className="min-h-11 justify-center px-2 active:opacity-70"
        >
          <Text className="text-sm text-board-muted">Trip options</Text>
        </Pressable>
      </View>
      <TripBoard detail={group} trip={trip} />
      {options ? <TripOptions trip={trip} group={group} onClose={() => setOptions(false)} /> : null}
    </>
  );
}

function TripOptions({
  trip,
  group,
  onClose,
}: {
  trip: TripDetail;
  group: GroupDetail;
  onClose: () => void;
}) {
  const navigation = useNavigation();
  const stacks = useStacks();
  const { userId } = useAuth();
  const end = useAction(stacks.Client.mutation("trips", "end"));
  const reopen = useAction(stacks.Client.mutation("trips", "reopen"));
  const remove = useAction(stacks.Client.mutation("trips", "delete"));
  const [confirming, setConfirming] = useState(false);
  const params = { tripId: trip.trip.id };
  const canDelete = isAdmin(group) || trip.trip.createdBy === userId;
  const error = end.error ?? reopen.error ?? remove.error;

  return (
    <Sheet open onClose={onClose} title={trip.trip.name}>
      {trip.trip.endedAt === null ? (
        <Button
          label="End trip"
          size="lg"
          pending={end.pending}
          onPress={() =>
            void end.run({ params, payload: {} }).then((ok) => (ok ? onClose() : undefined))
          }
        />
      ) : (
        <Button
          label="Reopen trip"
          size="lg"
          pending={reopen.pending}
          onPress={() => void reopen.run({ params }).then((ok) => (ok ? onClose() : undefined))}
        />
      )}
      {canDelete ? (
        <View className="gap-2">
          {confirming ? (
            <Text className="text-sm text-muted">
              The board and awards go away. Its sessions and everyone's balances stay in the group.
            </Text>
          ) : null}
          <Button
            label={confirming ? "Delete for good" : "Delete trip"}
            variant="danger"
            size="lg"
            pending={remove.pending}
            onPress={() => {
              if (!confirming) return setConfirming(true);
              void remove.run({ params }).then((ok) => {
                if (!ok) return;
                onClose();
                navigation.goBack();
              });
            }}
          />
        </View>
      ) : null}
      {error ? <FormError>{error}</FormError> : null}
    </Sheet>
  );
}
