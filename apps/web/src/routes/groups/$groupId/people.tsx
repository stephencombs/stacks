import { useAuth } from "@clerk/react";
import { createFileRoute } from "@tanstack/react-router";
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
import { UserPlus } from "lucide-react";
import { useState } from "react";

import { CopyButton } from "~/components/CopyButton";
import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { FormError } from "~/components/ui/Field";
import { Menu, MenuItem } from "~/components/ui/Menu";
import { BackLink } from "~/components/ui/Nav";
import { Note, PageHeader, Section } from "~/components/ui/Page";
import { List, Row, RowText, Tag } from "~/components/ui/Surface";
import { AddGuestDialog } from "~/features/AddGuestDialog";
import { Chip } from "~/features/Chip";
import { PlayerName } from "~/features/Player";
import { formatDay, isFormerMember, isGuest } from "@stacks/client-runtime/format";
import { Loaded, Prefetch, useAction, useStacks } from "~/lib/stacks";
import { GroupPageSkeleton, RowsSkeleton } from "~/features/PageSkeletons";

/** Who's in the group: members and their roles, guests, invite links, and who left. */
export const Route = createFileRoute("/groups/$groupId/people")({ component: People });

function People() {
  const { groupId } = Route.useParams();
  const stacks = useStacks();
  return (
    <>
      {/* The invites list sits mid-page, so its request starts with the page's. */}
      <Prefetch query={stacks.invites(GroupId.make(groupId))} />
      <Loaded
        query={stacks.group(GroupId.make(groupId))}
        skeleton={<GroupPageSkeleton on="people" />}
      >
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
      <PageHeader
        back={
          <BackLink to="/groups/$groupId" params={{ groupId: detail.group.id }}>
            {detail.group.name}
          </BackLink>
        }
        title="People"
        documentTitle={`People · ${detail.group.name}`}
      />

      <Section title="Members">
        <List>
          {members.map((player) => (
            <Row key={player.id}>
              <Chip chip={chipOf(detail, player.id)} name={player.displayName} size={28} />
              <RowText
                title={
                  <PlayerName name={player.displayName} you={player.id === detail.myPlayerId} />
                }
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
                <RowText title={player.displayName} className="basis-40" />
                <span className="ml-auto flex items-center gap-1">
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

      <AddGuestDialog detail={detail} open={addingGuest} onOpenChange={setAddingGuest} />
      {removing ? (
        <RemoveMemberDialog detail={detail} {...removing} onClose={() => setRemoving(null)} />
      ) : null}
    </>
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
