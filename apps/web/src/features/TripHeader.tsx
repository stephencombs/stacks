import { useAuth } from "@clerk/react";
import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import type { GroupDetail, TripDetail } from "@stacks/contracts";
import { isAdmin } from "@stacks/client-runtime/format";
import { tripDates } from "@stacks/client-runtime/trip";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { useState, type ReactNode } from "react";

import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { FormError } from "~/components/ui/Field";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "~/components/ui/Menu";
import { Tab, Tabs } from "~/components/ui/Nav";
import { PageHeader } from "~/components/ui/Page";
import { Tag } from "~/components/ui/Surface";
import { useAction, useLastTrip, useRememberTrip, useStacks } from "~/lib/stacks";

const tabs = [
  { key: "sessions", label: "Sessions", to: "/trips/$tripId" },
  { key: "results", label: "Results", to: "/trips/$tripId/results" },
  { key: "settle", label: "Settle up", to: "/trips/$tripId/settle" },
] as const;

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
  const navigate = useNavigate();
  const { userId } = useAuth();
  useRememberTrip(trip.trip.id);
  const end = useAction(stacks.Client.mutation("trips", "end"));
  const reopen = useAction(stacks.Client.mutation("trips", "reopen"));
  const [deleting, setDeleting] = useState(false);
  const params = { tripId: trip.trip.id };
  const ended = trip.trip.endedAt !== null;
  const canDelete =
    trip.sessions.length === 0 && (isAdmin(group) || trip.trip.createdBy === userId);

  return (
    <>
      <PageHeader
        back={<TripSwitcher group={group} trip={trip} />}
        options={
          <Menu label={`Actions for ${trip.trip.name}`}>
            {ended ? (
              <MenuItem onClick={() => void reopen.run({ params })}>Reopen trip</MenuItem>
            ) : (
              <MenuItem
                onClick={async () => {
                  if (await end.run({ params, payload: {} }))
                    void navigate({ to: "/trips/$tripId/settle", params });
                }}
              >
                End trip
              </MenuItem>
            )}
            {canDelete ? (
              <MenuItem tone="danger" onClick={() => setDeleting(true)}>
                Delete trip
              </MenuItem>
            ) : null}
          </Menu>
        }
        title={trip.trip.name}
        documentTitle={`${tabs.find((tab) => tab.key === current)!.label} · ${trip.trip.name}`}
        tag={ended ? <Tag>Ended</Tag> : null}
        context={`${group.group.name} · ${tripDates(trip.trip)}`}
        action={action}
        tabs={
          <>
            {(end.error ?? reopen.error) ? (
              <FormError>{end.error ?? reopen.error}</FormError>
            ) : null}
            <Tabs label="Trip">
              {tabs.map((tab) => (
                <Tab key={tab.key} to={tab.to} params={params} current={tab.key === current}>
                  {tab.label}
                </Tab>
              ))}
            </Tabs>
          </>
        }
      />
      {deleting ? (
        <DeleteTripDialog trip={trip} group={group} onClose={() => setDeleting(false)} />
      ) : null}
    </>
  );
}

function TripSwitcher({ group, trip }: { group: GroupDetail; trip: TripDetail }) {
  const stacks = useStacks();
  const navigate = useNavigate();
  const allGroups = AsyncResult.getOrElse(useAtomValue(stacks.groups), () => []);
  const otherGroups = allGroups.filter((item) => item.group.id !== group.group.id);
  const groupId = group.group.id;

  return (
    <Menu trigger={group.group.name}>
      <MenuLabel>{group.group.name}</MenuLabel>
      {group.trips.slice(0, 6).map((other) => (
        <MenuItem
          key={other.id}
          onClick={() => {
            if (other.id !== trip.trip.id)
              void navigate({ to: "/trips/$tripId", params: { tripId: other.id } });
          }}
        >
          <span className="truncate font-medium">{other.name}</span>
          <span className="shrink-0 text-xs text-muted">
            {other.id === trip.trip.id ? "Here" : tripDates(other)}
          </span>
        </MenuItem>
      ))}
      {otherGroups.length > 0 ? (
        <>
          <MenuSeparator />
          <MenuLabel>Other groups</MenuLabel>
          {otherGroups.map((item) => {
            const going = item.trips.find((t) => t.endedAt === null);
            return (
              <MenuItem
                key={item.group.id}
                onClick={() => {
                  if (going) void navigate({ to: "/trips/$tripId", params: { tripId: going.id } });
                  else
                    void navigate({ to: "/groups/$groupId", params: { groupId: item.group.id } });
                }}
              >
                <span className="truncate font-medium">{item.group.name}</span>
                {going ? (
                  <span className="shrink-0 truncate text-xs text-muted">{going.name}</span>
                ) : null}
              </MenuItem>
            );
          })}
        </>
      ) : null}
      <MenuSeparator />
      <MenuItem
        onClick={() => void navigate({ to: "/groups/$groupId/stats", params: { groupId } })}
      >
        All-time stats
      </MenuItem>
      <MenuItem
        onClick={() => void navigate({ to: "/groups/$groupId/settings", params: { groupId } })}
      >
        People
      </MenuItem>
      <MenuItem onClick={() => void navigate({ to: "/groups/$groupId", params: { groupId } })}>
        Past trips
      </MenuItem>
      <MenuItem onClick={() => void navigate({ to: "/groups" })}>Your groups</MenuItem>
    </Menu>
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
