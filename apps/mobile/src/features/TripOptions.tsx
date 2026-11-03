import { useAuth } from "@clerk/expo";
import type { GroupDetail, TripDetail } from "@stacks/contracts";
import { isAdmin } from "@stacks/client-runtime/format";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { FormError } from "../components/ui/Field";
import { Icon } from "../components/ui/Icon";
import { Sheet } from "../components/ui/Sheet";
import { useGo } from "../lib/go";
import { useScope } from "../lib/scope";
import { useAction, useStacks } from "../lib/stacks";

/** The trip's own actions behind "…" beside the Sessions title: end, reopen, delete. */
export function TripOptionsButton({ trip, group }: { trip: TripDetail; group: GroupDetail }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Trip options"
        accessibilityHint="End, reopen or delete this trip"
        onPress={() => setOpen(true)}
        className="size-11 items-center justify-center rounded-full bg-fill active:opacity-70"
      >
        <Icon name="more" color="ink" size={20} />
      </Pressable>
      {open ? <TripOptions trip={trip} group={group} onClose={() => setOpen(false)} /> : null}
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
  const go = useGo();
  const stacks = useStacks();
  const { userId } = useAuth();
  const end = useAction(stacks.Client.mutation("trips", "end"));
  const remove = useAction(stacks.Client.mutation("trips", "delete"));
  const { forgetTrip } = useScope();
  const [confirming, setConfirming] = useState(false);
  const params = { tripId: trip.trip.id };
  const canDelete =
    trip.sessions.length === 0 && (isAdmin(group) || trip.trip.createdBy === userId);
  const error = end.error ?? remove.error;

  return (
    <Sheet open onClose={onClose} title={trip.trip.name}>
      {trip.trip.endedAt === null ? (
        <Button
          label="End trip"
          size="lg"
          pending={end.pending}
          onPress={() =>
            void end.run({ params, payload: {} }).then((ok) => {
              if (!ok) return;
              onClose();
              go.trip(trip.trip.id, "SettleUp");
            })
          }
        />
      ) : (
        <ReopenTrip trip={trip} onDone={onClose} />
      )}
      {canDelete ? (
        <View className="gap-2">
          {confirming ? (
            <Text className="text-sm text-muted">
              Nothing has been played in it yet, so nothing else changes.
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
                forgetTrip(group.group.id);
                onClose();
              });
            }}
          />
        </View>
      ) : null}
      {error ? <FormError>{error}</FormError> : null}
    </Sheet>
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
