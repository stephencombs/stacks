import { useAuth } from "@clerk/expo";
import { useNavigation } from "@react-navigation/native";
import type { GroupDetail, TripDetail } from "@stacks/contracts";
import { isAdmin } from "@stacks/client-runtime/format";
import { tripCardModel } from "@stacks/client-runtime/shareCard";
import { chipOf, closedPlays, localClock, tripDates } from "@stacks/client-runtime/trip";
import { useEffect, useState } from "react";
import { Alert, Platform, View } from "react-native";

import { confirmAction } from "../components/ui/confirmAction";
import { ActionMenu } from "../components/ui/ActionMenu";
import { Button } from "../components/ui/Button";
import { FormError } from "../components/ui/Field";
import { afterDeletingTrip } from "../lib/crewRoutes";
import { useGo } from "../lib/go";
import { useScope } from "../lib/scope";
import { useAction, useStacks } from "../lib/stacks";
import { NameSheet } from "./NameSheet";
import { ShareCardSheet } from "./ShareCardSheet";

export function TripOptionsButton({ trip, group }: { trip: TripDetail; group: GroupDetail }) {
  const go = useGo();
  const navigation = useNavigation();
  const stacks = useStacks();
  const { userId } = useAuth();
  const [renaming, setRenaming] = useState(false);
  const [sharing, setSharing] = useState(false);
  const end = useAction(stacks.Client.mutation("trips", "end"));
  const reopen = useAction(stacks.Client.mutation("trips", "reopen"));
  const remove = useAction(stacks.Client.mutation("trips", "delete"));
  const { forgetTrip } = useScope();
  const params = { tripId: trip.trip.id };
  const pending = end.pending || reopen.pending || remove.pending;
  const error = end.error ?? reopen.error ?? remove.error;
  const android = Platform.OS === "android";
  useEffect(() => {
    if (android && error) Alert.alert("Trip update failed", error);
  }, [android, error]);

  const canDelete =
    trip.sessions.length === 0 &&
    trip.tables.length === 0 &&
    (isAdmin(group) || trip.trip.createdBy === userId);

  const finished = closedPlays(trip);

  const actions = [
    {
      label: "Rename",
      onPress: () => setRenaming(true),
    },
    ...(finished.length > 0 ? [{ label: "Share card", onPress: () => setSharing(true) }] : []),
    trip.trip.endedAt === null
      ? {
          label: "End trip",
          onPress: () => {
            void end.run({ params, payload: {} }).then((ok) => {
              if (ok) go.trip(trip.trip.id);
            });
          },
        }
      : {
          label: "Reopen trip",
          onPress: () => {
            void reopen.run({ params });
          },
        },
    ...(canDelete
      ? [
          {
            label: "Delete trip",
            destructive: true,
            onPress: () =>
              confirmAction(
                "Delete this trip?",
                "Nothing has been played in it yet. This cannot be undone.",
                "Delete trip",
                () => {
                  void remove.run({ params }).then((ok) => {
                    if (!ok) return;
                    forgetTrip(group.group.id, trip.trip.id);
                    navigation.dispatch(afterDeletingTrip(group.group.id));
                  });
                },
              ),
          },
        ]
      : []),
  ];

  return (
    <View className="gap-2">
      <ActionMenu label="Trip options" disabled={pending} actions={actions} vertical />
      {!android && error ? <FormError>{error}</FormError> : null}
      {renaming ? <RenameTripSheet trip={trip} onClose={() => setRenaming(false)} /> : null}
      {sharing ? (
        <ShareCardSheet
          title={trip.trip.name}
          onClose={() => setSharing(false)}
          card={(hidden) =>
            tripCardModel({
              name: trip.trip.name,
              dates: tripDates(trip.trip),
              venues: finished.map((play) => play.venue?.name ?? null),
              currency: group.group.currency,
              me: group.myPlayerId,
              closed: finished,
              players: group.players,
              chip: (playerId) => chipOf(group, playerId),
              clock: localClock,
              hidden,
            })
          }
        />
      ) : null}
    </View>
  );
}

function RenameTripSheet({ trip, onClose }: { trip: TripDetail; onClose: () => void }) {
  const stacks = useStacks();
  const rename = useAction(stacks.Client.mutation("trips", "rename"));

  return (
    <NameSheet
      title="Rename trip"
      label="Trip name"
      initial={trip.trip.name}
      maxLength={60}
      emptyError="Give the trip a name."
      pending={rename.pending}
      error={rename.error}
      onClose={onClose}
      onSave={async (name) =>
        Boolean(await rename.run({ params: { tripId: trip.trip.id }, payload: { name } }))
      }
    />
  );
}

/** Ended trips take no sessions; reopening is the way back. */
export function ReopenTrip({
  trip,
  onDone,
  size = "lg",
}: {
  trip: TripDetail;
  onDone?: () => void;
  size?: "md" | "lg";
}) {
  const stacks = useStacks();
  const reopen = useAction(stacks.Client.mutation("trips", "reopen"));

  return (
    <View className="gap-2">
      <Button
        label="Reopen trip"
        size={size}
        pending={reopen.pending}
        onPress={() =>
          void reopen
            .run({ params: { tripId: trip.trip.id } })
            .then((ok) => (ok ? onDone?.() : undefined))
        }
      />
      {reopen.error ? <FormError>{reopen.error}</FormError> : null}
    </View>
  );
}
