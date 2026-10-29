import { useAuth } from "@clerk/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { TripId, type GroupDetail, type TripDetail } from "@stacks/contracts";
import { isAdmin } from "@stacks/client-runtime/format";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { FormError } from "~/components/ui/Field";
import { Menu, MenuItem } from "~/components/ui/Menu";
import { Skeleton } from "~/components/ui/Surface";
import { TripBoard } from "~/features/TripBoard";
import { Loaded, useAction, useStacks } from "~/lib/stacks";

export const Route = createFileRoute("/trips/$tripId")({ component: TripPage });

function TripPage() {
  const { tripId } = Route.useParams();
  const stacks = useStacks();
  return (
    <Loaded query={stacks.trip(TripId.make(tripId))} skeleton={<Skeleton className="mt-4 h-96" />}>
      {(trip) => (
        <Loaded
          query={stacks.group(trip.trip.groupId)}
          skeleton={<Skeleton className="mt-4 h-96" />}
        >
          {(group) => <TripView trip={trip} group={group} />}
        </Loaded>
      )}
    </Loaded>
  );
}

function TripView({ trip, group }: { trip: TripDetail; group: GroupDetail }) {
  const stacks = useStacks();
  const { userId } = useAuth();
  const end = useAction(stacks.Client.mutation("trips", "end"));
  const reopen = useAction(stacks.Client.mutation("trips", "reopen"));
  const [deleting, setDeleting] = useState(false);
  const params = { tripId: trip.trip.id };
  const canDelete = isAdmin(group) || trip.trip.createdBy === userId;

  return (
    <>
      <div className="flex items-center justify-between gap-3 pt-4">
        <Link
          to="/groups/$groupId"
          params={{ groupId: group.group.id }}
          className="-ml-1 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {group.group.name}
        </Link>
        <Menu label={`Actions for ${trip.trip.name}`}>
          {trip.trip.endedAt === null ? (
            <MenuItem onClick={() => void end.run({ params, payload: {} })}>End trip</MenuItem>
          ) : (
            <MenuItem onClick={() => void reopen.run({ params })}>Reopen trip</MenuItem>
          )}
          {canDelete ? (
            <MenuItem tone="danger" onClick={() => setDeleting(true)}>
              Delete trip
            </MenuItem>
          ) : null}
        </Menu>
      </div>
      {(end.error ?? reopen.error) ? <FormError>{end.error ?? reopen.error}</FormError> : null}
      <TripBoard detail={group} trip={trip} />
      {deleting ? (
        <DeleteTripDialog trip={trip} group={group} onClose={() => setDeleting(false)} />
      ) : null}
    </>
  );
}

function DeleteTripDialog({
  trip,
  group,
  onClose,
}: {
  trip: TripDetail;
  group: GroupDetail;
  onClose: () => void;
}) {
  const stacks = useStacks();
  const navigate = useNavigate();
  const remove = useAction(stacks.Client.mutation("trips", "delete"));
  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={`Delete ${trip.trip.name}?`}
      description="The board and awards go away. Its sessions and everyone's balances stay in the group."
    >
      <div className="flex flex-col gap-4">
        {remove.error ? <FormError>{remove.error}</FormError> : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Keep it</Button>
          <Button
            variant="danger"
            disabled={remove.pending}
            onClick={async () => {
              if (await remove.run({ params: { tripId: trip.trip.id } }))
                void navigate({ to: "/groups/$groupId", params: { groupId: group.group.id } });
            }}
          >
            {remove.pending ? "Deleting…" : "Delete trip"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
