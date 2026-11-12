import { useAuth } from "@clerk/react";
import { useNavigate } from "@tanstack/react-router";
import type { GroupDetail, TripDetail } from "@stacks/contracts";
import { isAdmin } from "@stacks/client-runtime/format";
import { useState, type ReactNode } from "react";

import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { FormError } from "~/components/ui/Field";
import { Menu, MenuItem } from "~/components/ui/Menu";
import { PageHeader } from "~/components/ui/Page";
import { Tag } from "~/components/ui/Surface";
import { useAction, useLastTrip, useRememberTrip, useStacks } from "~/lib/stacks";

const titles = { sessions: "Sessions", board: "Board" } as const;

/**
 * A trip place's title. The scope button already names the trip, so the title is the place.
 * Sessions, the trip's home, also says when the trip has ended and holds the trip's own menu.
 */
export function TripHeader({
  group,
  trip,
  place,
  action,
  children,
}: {
  group: GroupDetail;
  trip: TripDetail;
  place: keyof typeof titles;
  action?: ReactNode;
  children?: ReactNode;
}) {
  const stacks = useStacks();
  const { userId } = useAuth();
  useRememberTrip(trip.trip.id);
  const end = useAction(stacks.Client.mutation("trips", "end"));
  const reopen = useAction(stacks.Client.mutation("trips", "reopen"));
  const [deleting, setDeleting] = useState(false);
  const params = { tripId: trip.trip.id };
  const ended = trip.trip.endedAt !== null;
  const home = place === "sessions";
  const canDelete =
    trip.sessions.length === 0 && (isAdmin(group) || trip.trip.createdBy === userId);
  const title = titles[place];

  const menu = (
    <Menu label={`Actions for ${trip.trip.name}`}>
      {ended ? (
        <MenuItem onClick={() => void reopen.run({ params })}>Reopen trip</MenuItem>
      ) : (
        <MenuItem onClick={() => void end.run({ params, payload: {} })}>End trip</MenuItem>
      )}
      {canDelete ? (
        <MenuItem tone="danger" onClick={() => setDeleting(true)}>
          Delete trip
        </MenuItem>
      ) : null}
    </Menu>
  );

  return (
    <>
      <PageHeader
        title={title}
        documentTitle={`${title} · ${trip.trip.name}`}
        tag={home && ended ? <Tag>Ended</Tag> : null}
        action={
          home ? (
            <div className="flex items-center gap-2">
              {action}
              {menu}
            </div>
          ) : (
            action
          )
        }
      >
        {(end.error ?? reopen.error) ? <FormError>{end.error ?? reopen.error}</FormError> : null}
        {children}
      </PageHeader>
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
  const { lastTripId, setLastTripId } = useLastTrip();
  const remove = useAction(stacks.Client.mutation("trips", "delete"));
  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={`Delete ${trip.trip.name}?`}
      description="Nothing has been played in it yet, so nothing else changes."
    >
      <div className="flex flex-col gap-4">
        {remove.error ? <FormError>{remove.error}</FormError> : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Keep it</Button>
          <Button
            variant="danger"
            pending={remove.pending}
            onClick={async () => {
              if (await remove.run({ params: { tripId: trip.trip.id } })) {
                if (lastTripId === trip.trip.id) setLastTripId(null);
                void navigate({ to: "/groups/$groupId", params: { groupId: group.group.id } });
              }
            }}
          >
            Delete trip
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
