import { useAuth } from "@clerk/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { GroupId, InviteId, UserId, type GroupDetail, type Player } from "@stacks/contracts";
import { newId } from "@stacks/client-runtime/ids";
import { UserPlus } from "lucide-react";
import { useState } from "react";

import { CopyButton } from "~/components/CopyButton";
import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { FormError } from "~/components/ui/Field";
import { Menu, MenuItem } from "~/components/ui/Menu";
import { SectionHeading, Skeleton, Surface, Tag } from "~/components/ui/Surface";
import { AddGuestDialog } from "~/features/AddGuestDialog";
import { GroupHeader } from "~/features/GroupHeader";
import { formatDay } from "~/lib/format";
import { Loaded, useAction, useStacks } from "~/lib/stacks";

export const Route = createFileRoute("/groups/$groupId/settings")({ component: People });

function People() {
  const { groupId } = Route.useParams();
  const stacks = useStacks();
  return (
    <Loaded
      query={stacks.group(GroupId.make(groupId))}
      skeleton={<Skeleton className="mt-4 h-96" />}
    >
      {(detail) => <PeopleView detail={detail} />}
    </Loaded>
  );
}

const roleNames = { owner: "Owner", admin: "Admin", member: "Member" } as const;

function PeopleView({ detail }: { detail: GroupDetail }) {
  const { userId } = useAuth();
  const stacks = useStacks();
  const setRole = useAction(stacks.Client.mutation("groups", "setRole"));
  const remove = useAction(stacks.Client.mutation("groups", "removeMember"));
  const [addingGuest, setAddingGuest] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const members = detail.players.filter((player) => player.role !== null);
  const guests = detail.players.filter((player) => player.userId === null);
  const former = detail.players.filter((player) => player.userId !== null && player.role === null);
  const origin = window.location.origin;

  const memberActions = (player: Player) => {
    if (!player.userId || player.userId === userId || player.role === "owner") return null;
    const target = UserId.make(player.userId);
    const params = { groupId: detail.group.id, userId: target };
    const canRemove =
      detail.role === "owner" || (detail.role === "admin" && player.role === "member");
    if (detail.role !== "owner" && !canRemove) return null;
    return (
      <Menu label={`Manage ${player.displayName}`}>
        {detail.role === "owner" ? (
          <MenuItem
            onClick={() =>
              void setRole.run({
                params,
                payload: { role: player.role === "admin" ? "member" : "admin" },
              })
            }
          >
            {player.role === "admin" ? "Make a member" : "Make an admin"}
          </MenuItem>
        ) : null}
        {canRemove ? (
          <MenuItem tone="danger" onClick={() => void remove.run({ params })}>
            Remove from group
          </MenuItem>
        ) : null}
      </Menu>
    );
  };

  return (
    <>
      <GroupHeader detail={detail} current="settings" />

      <InviteSection detail={detail} origin={origin} />

      <section className="flex flex-col gap-2">
        <SectionHeading>Members</SectionHeading>
        <Surface className="divide-y divide-line">
          {members.map((player) => (
            <div key={player.id} className="flex items-center gap-3 px-5 py-3">
              <span className="min-w-0 flex-1 truncate">
                {player.displayName}
                {player.id === detail.myPlayerId ? (
                  <span className="text-muted"> (you)</span>
                ) : null}
              </span>
              {player.role ? <Tag>{roleNames[player.role]}</Tag> : null}
              {memberActions(player)}
            </div>
          ))}
        </Surface>
        {(setRole.error ?? remove.error) ? (
          <FormError>{setRole.error ?? remove.error}</FormError>
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading
          action={
            <Button size="sm" variant="ghost" onClick={() => setAddingGuest(true)}>
              <UserPlus className="size-4" aria-hidden />
              Add a guest
            </Button>
          }
        >
          Guests
        </SectionHeading>
        {guests.length === 0 ? (
          <p className="text-sm text-muted">
            Add friends who aren't on Stacks yet. Send them their claim link when they sign up and
            their history becomes theirs.
          </p>
        ) : (
          <Surface className="divide-y divide-line">
            {guests.map((player) => (
              <div key={player.id} className="flex items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1 truncate">{player.displayName}</span>
                {player.claimCode ? (
                  <CopyButton
                    text={`${origin}/claim/${player.claimCode}`}
                    label="Copy claim link"
                  />
                ) : null}
              </div>
            ))}
          </Surface>
        )}
      </section>

      {former.length > 0 ? (
        <section className="flex flex-col gap-2">
          <SectionHeading>Former members</SectionHeading>
          <p className="text-sm text-muted">
            {former.map((player) => player.displayName).join(", ")}. Their history stays in the
            ledger.
          </p>
        </section>
      ) : null}

      <section className="flex flex-col items-start gap-2 border-t border-line pt-6">
        <Button variant="danger" onClick={() => setLeaving(true)}>
          Leave group
        </Button>
        <p className="text-sm text-muted">You can only leave once you're settled up.</p>
      </section>

      <AddGuestDialog detail={detail} open={addingGuest} onOpenChange={setAddingGuest} />
      <LeaveDialog detail={detail} open={leaving} onOpenChange={setLeaving} />
    </>
  );
}

function InviteSection({ detail, origin }: { detail: GroupDetail; origin: string }) {
  const stacks = useStacks();
  const create = useAction(stacks.Client.mutation("invites", "create"));
  const revoke = useAction(stacks.Client.mutation("invites", "revoke"));
  return (
    <section className="flex flex-col gap-2">
      <SectionHeading
        action={
          <Button
            size="sm"
            onClick={() =>
              void create.run({
                params: { groupId: detail.group.id },
                payload: { id: InviteId.make(newId()), maxUses: null },
              })
            }
            disabled={create.pending}
          >
            New invite link
          </Button>
        }
      >
        Invite links
      </SectionHeading>
      <Loaded query={stacks.invites(detail.group.id)} skeleton={<Skeleton className="h-16" />}>
        {(invites) =>
          invites.length === 0 ? (
            <p className="text-sm text-muted">
              Make a link and send it to anyone you want in the group. Links last a week.
            </p>
          ) : (
            <Surface className="divide-y divide-line">
              {invites.map((invite) => (
                <div key={invite.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-mono text-sm">{`${origin}/join/${invite.code}`}</span>
                    <span className="text-sm text-muted">
                      Expires {formatDay(invite.expiresAt)} · used {invite.uses}
                      {invite.maxUses ? ` of ${invite.maxUses}` : ""}{" "}
                      {invite.uses === 1 ? "time" : "times"}
                    </span>
                  </div>
                  <CopyButton text={`${origin}/join/${invite.code}`} />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void revoke.run({ params: { inviteId: invite.id } })}
                  >
                    Revoke
                  </Button>
                </div>
              ))}
            </Surface>
          )
        }
      </Loaded>
      {(create.error ?? revoke.error) ? (
        <FormError>{create.error ?? revoke.error}</FormError>
      ) : null}
    </section>
  );
}

function LeaveDialog({
  detail,
  open,
  onOpenChange,
}: {
  detail: GroupDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const stacks = useStacks();
  const navigate = useNavigate();
  const leave = useAction(stacks.Client.mutation("groups", "leave"));
  const confirm = async () => {
    if (await leave.run({ params: { groupId: detail.group.id } })) void navigate({ to: "/" });
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Leave ${detail.group.name}?`}
      description="Your history stays in the group's ledger. Someone can invite you back."
    >
      <div className="flex flex-col gap-4">
        {leave.error ? <FormError>{leave.error}</FormError> : null}
        <div className="flex justify-end gap-2">
          <Button onClick={() => onOpenChange(false)}>Stay</Button>
          <Button variant="danger" onClick={() => void confirm()} disabled={leave.pending}>
            {leave.pending ? "Leaving…" : "Leave group"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
