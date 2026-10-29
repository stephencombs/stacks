import { useAuth } from "@clerk/react";
import { useNavigate } from "@tanstack/react-router";
import type { GroupDetail, TripDetail } from "@stacks/contracts";
import { isAdmin } from "@stacks/client-runtime/format";
import { tripDates } from "@stacks/client-runtime/trip";
import { useState, type ReactNode } from "react";

import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { FormError } from "~/components/ui/Field";
import { Menu, MenuItem } from "~/components/ui/Menu";
import { BackLink, Tab, Tabs } from "~/components/ui/Nav";
import { PageTitle, Tag } from "~/components/ui/Surface";
import { useAction, useStacks } from "~/lib/stacks";

const tabs = [
  { key: "board", label: "Board", to: "/trips/$tripId" },
  { key: "stats", label: "Stats", to: "/trips/$tripId/stats" },
  { key: "settle", label: "Settle up", to: "/trips/$tripId/settle" },
] as const;

/** A trip's name, dates and tabs, with a way back to its group and the trip's own options. */
export function TripHeader({
  group,
  trip,
  current,
  action,
}: {
  group: GroupDetail;
  trip: TripDetail;
  current: (typeof tabs)[number]["key"];
  action?: ReactNode;
}) {
  const stacks = useStacks();
  const { userId } = useAuth();
  const end = useAction(stacks.Client.mutation("trips", "end"));
  const reopen = useAction(stacks.Client.mutation("trips", "reopen"));
  const [deleting, setDeleting] = useState(false);
  const params = { tripId: trip.trip.id };
  const ended = trip.trip.endedAt !== null;
  const canDelete =
    trip.sessions.length === 0 && (isAdmin(group) || trip.trip.createdBy === userId);

  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="flex items-center justify-between gap-3">
        <BackLink to="/groups/$groupId" params={{ groupId: group.group.id }}>
          {group.group.name}
        </BackLink>
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
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <PageTitle context={tripDates(trip.trip)}>{trip.trip.name}</PageTitle>
          <p>{ended ? <Tag>Ended</Tag> : <Tag tone="live">Going</Tag>}</p>
        </div>
        {action}
      </div>
      {(end.error ?? reopen.error) ? <FormError>{end.error ?? reopen.error}</FormError> : null}
      <Tabs label="Trip">
        {tabs.map((tab) => (
          <Tab key={tab.key} to={tab.to} params={params} current={tab.key === current}>
            {tab.label}
          </Tab>
        ))}
      </Tabs>
      {deleting ? (
        <DeleteTripDialog trip={trip} group={group} onClose={() => setDeleting(false)} />
      ) : null}
    </div>
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
      description="Nothing has been played in it yet, so nothing else changes."
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
