import { useAuth } from "@clerk/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  GroupId,
  InviteId,
  UserId,
  type GroupDetail,
  type Invite,
  type Player,
} from "@stacks/contracts";
import { newId } from "@stacks/client-runtime/ids";
import { chipOf } from "@stacks/client-runtime/trip";
import { Download, UserPlus } from "lucide-react";
import { useState } from "react";

import { CopyButton } from "~/components/CopyButton";
import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { FormError } from "~/components/ui/Field";
import { Menu, MenuItem } from "~/components/ui/Menu";
import { Note, Section } from "~/components/ui/Page";
import { List, Row, RowText, Tag } from "~/components/ui/Surface";
import { AddGuestDialog } from "~/features/AddGuestDialog";
import { Chip } from "~/features/Chip";
import { GroupHeader } from "~/features/GroupHeader";
import {
  GuestPaymentHandlesAction,
  PaymentAppsSection,
  playerHandlesMeta,
} from "~/features/PaymentHandles";
import { PlayerName } from "~/features/Player";
import { csvFilename, formatDay, isFormerMember, isGuest } from "@stacks/client-runtime/format";
import { Loaded, Prefetch, useAction, useStacks } from "~/lib/stacks";
import { GroupPageSkeleton, RowsSkeleton } from "~/features/PageSkeletons";

export const Route = createFileRoute("/groups/$groupId/settings")({ component: People });

function People() {
  const { groupId } = Route.useParams();
  const stacks = useStacks();
  return (
    <>
      {/* The invites list sits mid-page, so its request starts with the page's. */}
      <Prefetch query={stacks.invites(GroupId.make(groupId))} />
      <Loaded query={stacks.group(GroupId.make(groupId))} skeleton={<GroupPageSkeleton rows={5} />}>
        {(detail) => <PeopleView detail={detail} />}
      </Loaded>
    </>
  );
}

const roleNames = { owner: "Owner", admin: "Admin" } as const;

function PeopleView({ detail }: { detail: GroupDetail }) {
  const { userId } = useAuth();
  const stacks = useStacks();
  const setRole = useAction(stacks.Client.mutation("groups", "setRole"));
  const [addingGuest, setAddingGuest] = useState(false);
  const [removing, setRemoving] = useState<{ player: Player; userId: UserId } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const members = detail.players.filter((player) => player.role !== null);
  const guests = detail.players.filter(isGuest);
  const former = detail.players.filter(isFormerMember);
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
          <MenuItem tone="danger" onClick={() => setRemoving({ player, userId: target })}>
            Remove from group
          </MenuItem>
        ) : null}
      </Menu>
    );
  };

  return (
    <>
      <GroupHeader detail={detail} current="settings" />

      <Section title="Members">
        <List>
          {members.map((player) => (
            <Row key={player.id}>
              <Chip chip={chipOf(detail, player.id)} name={player.displayName} size={28} />
              <RowText
                title={
                  <PlayerName name={player.displayName} you={player.id === detail.myPlayerId} />
                }
                meta={playerHandlesMeta(player)}
              />
              {player.role === "owner" || player.role === "admin" ? (
                <Tag>{roleNames[player.role]}</Tag>
              ) : null}
              {memberActions(player)}
            </Row>
          ))}
        </List>
        {setRole.error ? <FormError>{setRole.error}</FormError> : null}
      </Section>

      <PaymentAppsSection detail={detail} />

      <Section
        title="Guests"
        action={
          <Button size="sm" variant="ghost" onClick={() => setAddingGuest(true)}>
            <UserPlus className="size-4" aria-hidden />
            Add a guest
          </Button>
        }
      >
        {guests.length === 0 ? (
          <Note>
            Add friends who aren't on Color Up yet. When they sign up through their claim link,
            their history becomes theirs.
          </Note>
        ) : (
          <List>
            {guests.map((player) => (
              <Row key={player.id} className="flex-wrap">
                <Chip chip={chipOf(detail, player.id)} name={player.displayName} size={28} />
                <RowText title={player.displayName} meta={playerHandlesMeta(player)} />
                <span className="ml-auto flex items-center gap-1">
                  <GuestPaymentHandlesAction detail={detail} player={player} />
                  {player.claimCode ? (
                    <CopyButton
                      text={`${origin}/claim/${player.claimCode}`}
                      label="Copy claim link"
                    />
                  ) : null}
                </span>
              </Row>
            ))}
          </List>
        )}
      </Section>

      <InviteSection detail={detail} origin={origin} />

      {former.length > 0 ? (
        <Section title="Former members">
          <Note>
            {former.map((player) => player.displayName).join(", ")}. Their history stays in the
            ledger.
          </Note>
        </Section>
      ) : null}

      <ExportSection detail={detail} />

      <div className="flex flex-col items-start gap-2">
        <Button variant="danger" onClick={() => setLeaving(true)}>
          Leave group
        </Button>
        <Note>You can only leave once you're settled up.</Note>
      </div>

      <AddGuestDialog detail={detail} open={addingGuest} onOpenChange={setAddingGuest} />
      <LeaveDialog detail={detail} open={leaving} onOpenChange={setLeaving} />
      {removing ? (
        <RemoveMemberDialog detail={detail} {...removing} onClose={() => setRemoving(null)} />
      ) : null}
    </>
  );
}

function ExportSection({ detail }: { detail: GroupDetail }) {
  const stacks = useStacks();
  const exportCsv = useAction(stacks.Client.mutation("groups", "exportCsv"));
  const download = async () => {
    const csv = await exportCsv.run({ params: { groupId: detail.group.id } });
    if (csv == null) return;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = csvFilename(detail.group.name);
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Section title="Ledger">
      <div className="flex flex-col items-start gap-2">
        <Button onClick={() => void download()} pending={exportCsv.pending}>
          <Download className="size-4" aria-hidden />
          Export CSV
        </Button>
        <Note>Every buy-in, cash-out, adjustment, settlement and void in this group.</Note>
        {exportCsv.error ? <FormError>{exportCsv.error}</FormError> : null}
      </div>
    </Section>
  );
}

function InviteSection({ detail, origin }: { detail: GroupDetail; origin: string }) {
  const stacks = useStacks();
  const create = useAction(stacks.Client.mutation("invites", "create"));
  const [revoking, setRevoking] = useState<Invite | null>(null);
  return (
    <Section
      title="Invite links"
      action={
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void create.run({
              params: { groupId: detail.group.id },
              payload: { id: InviteId.make(newId()), maxUses: null },
            })
          }
          pending={create.pending}
        >
          New invite link
        </Button>
      }
    >
      <Loaded
        query={stacks.invites(detail.group.id)}
        skeleton={<RowsSkeleton rows={1} trailing={false} />}
      >
        {(invites) =>
          invites.length === 0 ? (
            <Note>Make a link and send it to anyone you want in the group. Links last a week.</Note>
          ) : (
            <List>
              {invites.map((invite) => (
                <Row key={invite.id} className="flex-wrap">
                  <span className="min-w-48 flex-1 basis-48">
                    <RowText
                      title={<span className="text-sm">{`${origin}/join/${invite.code}`}</span>}
                      meta={
                        <>
                          Expires {formatDay(invite.expiresAt)} · used {invite.uses}
                          {invite.maxUses ? ` of ${invite.maxUses}` : ""}{" "}
                          {invite.uses === 1 ? "time" : "times"}
                        </>
                      }
                    />
                  </span>
                  <span className="ml-auto flex items-center gap-1">
                    <CopyButton text={`${origin}/join/${invite.code}`} />
                    <Button size="sm" variant="ghost" onClick={() => setRevoking(invite)}>
                      Revoke
                    </Button>
                  </span>
                </Row>
              ))}
            </List>
          )
        }
      </Loaded>
      {create.error ? <FormError>{create.error}</FormError> : null}
      {revoking ? (
        <RevokeInviteDialog
          invite={revoking}
          url={`${origin}/join/${revoking.code}`}
          onClose={() => setRevoking(null)}
        />
      ) : null}
    </Section>
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
          <Button variant="danger" onClick={() => void confirm()} pending={leave.pending}>
            Leave group
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function RemoveMemberDialog({
  detail,
  player,
  userId,
  onClose,
}: {
  detail: GroupDetail;
  player: Player;
  userId: UserId;
  onClose: () => void;
}) {
  const stacks = useStacks();
  const remove = useAction(stacks.Client.mutation("groups", "removeMember"));
  const confirm = async () => {
    if (await remove.run({ params: { groupId: detail.group.id, userId } })) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={`Remove ${player.displayName}?`}
      description="They lose access to the group. Their history stays in the ledger, and you can invite them back."
    >
      <div className="flex flex-col gap-4">
        {remove.error ? <FormError>{remove.error}</FormError> : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Keep them</Button>
          <Button variant="danger" onClick={() => void confirm()} pending={remove.pending}>
            Remove
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function RevokeInviteDialog({
  invite,
  url,
  onClose,
}: {
  invite: Invite;
  url: string;
  onClose: () => void;
}) {
  const stacks = useStacks();
  const revoke = useAction(stacks.Client.mutation("invites", "revoke"));
  const confirm = async () => {
    if (await revoke.run({ params: { inviteId: invite.id } })) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="Revoke this invite link?"
      description="Anyone who hasn't joined yet will need a new link."
    >
      <div className="flex flex-col gap-4">
        <p className="truncate text-sm text-muted">{url}</p>
        {revoke.error ? <FormError>{revoke.error}</FormError> : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Keep it</Button>
          <Button variant="danger" onClick={() => void confirm()} pending={revoke.pending}>
            Revoke link
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
