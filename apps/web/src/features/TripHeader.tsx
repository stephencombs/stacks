import { useAuth } from "@clerk/react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { GroupDetail, TripDetail } from "@stacks/contracts";
import { isAdmin } from "@stacks/client-runtime/format";
import { tripDates } from "@stacks/client-runtime/trip";
import { ChevronLeft } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { FormError } from "~/components/ui/Field";
import { Menu, MenuItem } from "~/components/ui/Menu";
import { Tag } from "~/components/ui/Surface";
import { cn } from "~/components/ui/cn";
import { useAction, useStacks } from "~/lib/stacks";

const tabs = [
  { key: "board", label: "Board", to: "/trips/$tripId" },
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
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/groups/$groupId"
          params={{ groupId: group.group.id }}
          className="-ml-1 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {group.group.name}
        </Link>
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
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-4xl font-medium">{trip.trip.name}</h1>
          <p className="flex items-center gap-2 text-muted">
            {tripDates(trip.trip)}
            {ended ? <Tag>Ended</Tag> : <Tag tone="live">Going</Tag>}
          </p>
        </div>
        {action}
      </div>
      {(end.error ?? reopen.error) ? <FormError>{end.error ?? reopen.error}</FormError> : null}
      {/* The padding keeps focus rings inside the scroll box, which clips everything past its edge. */}
      <nav aria-label="Trip" className="-m-1 flex gap-1 overflow-x-auto p-1">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            to={tab.to}
            params={params}
            aria-current={tab.key === current ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-lg px-3 text-sm whitespace-nowrap transition-colors duration-150 pointer-coarse:h-11",
              tab.key === current
                ? "bg-surface text-ink shadow-[0_0_0_1px_var(--color-line)]"
                : "text-muted hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
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
