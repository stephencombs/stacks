import { useAuth } from "@clerk/expo";
import type { GroupDetail, TripDetail } from "@stacks/contracts";
import { isAdmin } from "@stacks/client-runtime/format";
import { View } from "react-native";

import { confirmAction } from "../components/ui/confirmAction";
import { ActionMenu } from "../components/ui/ActionMenu";
import { Button } from "../components/ui/Button";
import { FormError } from "../components/ui/Field";
import { useGo } from "../lib/go";
import { useScope } from "../lib/scope";
import { useAction, useStacks } from "../lib/stacks";

export function TripOptionsButton({ trip, group }: { trip: TripDetail; group: GroupDetail }) {
  const go = useGo();
  const stacks = useStacks();
  const { userId } = useAuth();
  const end = useAction(stacks.Client.mutation("trips", "end"));
  const reopen = useAction(stacks.Client.mutation("trips", "reopen"));
  const remove = useAction(stacks.Client.mutation("trips", "delete"));
  const { forgetTrip } = useScope();
  const params = { tripId: trip.trip.id };
  const pending = end.pending || reopen.pending || remove.pending;
  const error = end.error ?? reopen.error ?? remove.error;
  const canDelete =
    trip.sessions.length === 0 && (isAdmin(group) || trip.trip.createdBy === userId);
  const actions = [
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
                    if (ok) forgetTrip(group.group.id);
                  });
                },
              ),
          },
        ]
      : []),
  ];
  return (
    <View className="gap-2">
      <ActionMenu label="Trip options" disabled={pending} actions={actions} />
      {error ? <FormError>{error}</FormError> : null}
    </View>
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
