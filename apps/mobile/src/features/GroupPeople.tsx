import { useAuth } from "@clerk/expo";
import { InviteId, type GroupDetail, type Player } from "@stacks/contracts";
import {
  distinctPlayerNames,
  formatDay,
  isFormerMember,
  isGuest,
} from "@stacks/client-runtime/format";
import { newId } from "@stacks/client-runtime/ids";
import { setStringAsync } from "expo-clipboard";
import { useState, type ReactNode } from "react";
import { Platform, View } from "react-native";
import { Text } from "../components/ui/Text";

import { confirmAction } from "../components/ui/confirmAction";
import { Button } from "../components/ui/Button";
import { FormError } from "../components/ui/Field";
import { Icon } from "../components/ui/Icon";
import { Sheet } from "../components/ui/Sheet";
import { useToast } from "../components/ui/Toast";
import { List, Row, SectionHeading } from "../components/ui/Surface";
import { SwipeRow, type SwipeAction } from "../components/ui/SwipeRow";
import { inviteUrl } from "../lib/config";
import { shareLink } from "../lib/share";
import { Loaded, useAction, useStacks } from "../lib/stacks";
import { AddGuestSheet } from "./AddGuestSheet";
import { ContactPhotoControls } from "./ContactPhoto";
import { playerActions } from "./playerActions";
import { PlayerAvatar } from "./PlayerAvatar";
import { InviteLinkSkeleton } from "./ScreenSkeletons";

const roleNames = { owner: "Owner", admin: "Admin", member: "Member" } as const;

/** Everyone in the group: members and their roles, guests, invite links, and who left. */
export function GroupPeople({ detail }: { detail: GroupDetail }) {
  const [action, setAction] = useState<"invite" | "guest" | null>(null);
  const [openedId, setOpenedId] = useState<Player["id"] | null>(null);
  const [removing, setRemoving] = useState(false);
  const opened = detail.players.find((player) => player.id === openedId);
  const { userId } = useAuth();
  const viewer = { role: detail.role, userId };
  const stacks = useStacks();
  const toast = useToast();
  const setRole = useAction(stacks.Client.mutation("groups", "setRole"));
  const addBack = useAction(stacks.Client.mutation("guests", "restore"));
  const members = detail.players.filter((player) => player.role !== null);
  const guests = detail.players.filter(isGuest);
  const former = detail.players.filter(isFormerMember);

  const names = distinctPlayerNames(
    [...members, ...guests, ...former].map((player) => [player.id, player.displayName]),
  );

  const open = (player: Player, remove = false) => {
    setRemoving(remove);
    setOpenedId(player.id);
  };

  const swipes = (player: Player) => {
    const can = playerActions(viewer, player);
    const groupId = detail.group.id;
    const leading: SwipeAction[] = [];

    if (can.changeRole && player.userId !== null) {
      const role = player.role === "admin" ? "member" : "admin";
      const params = { groupId, userId: player.userId };

      leading.push({
        label: role === "admin" ? "Make admin" : "Make member",
        icon: "person",
        onPress: () =>
          void setRole.attempt({ params, payload: { role } }).then(({ error }) => {
            if (error) toast({ message: error });
          }),
      });
    }

    if (can.addBack)
      leading.push({
        label: "Add back",
        icon: "add-person",
        onPress: () =>
          void addBack.attempt({ params: { groupId, playerId: player.id } }).then(({ error }) => {
            if (error) toast({ message: error });
          }),
      });

    const trailing: SwipeAction[] =
      can.manage || can.removeGuest
        ? [{ label: "Remove", icon: "trash", destructive: true, onPress: () => open(player, true) }]
        : [];

    return { leading, trailing };
  };

  const row = (player: Player, detailLine: string, trailing?: ReactNode) => (
    <SwipeRow
      key={player.id}
      {...(player.id === detail.myPlayerId
        ? {}
        : {
            ...swipes(player),
            onPress: () => open(player),
            accessibilityHint: "Opens their details",
          })}
    >
      <PlayerAvatar
        playerId={player.id}
        name={player.displayName}
        size={36}
        you={player.id === detail.myPlayerId}
      />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={2} className="type-heading font-bold text-ink">
          {names.get(player.id)}
          {player.id === detail.myPlayerId ? <Text className="text-ink"> · you</Text> : null}
        </Text>
        <Text className="type-footnote text-muted">{detailLine}</Text>
      </View>
      {trailing}
    </SwipeRow>
  );

  return (
    <>
      <View className="gap-2">
        <SectionHeading
          action={
            <Button
              label="Invite"
              size="sm"
              variant="link"
              className="px-1"
              onPress={() => setAction("invite")}
            />
          }
        >
          People
        </SectionHeading>
        <List>
          {members.map((player) => row(player, roleNames[player.role!]))}
          {guests.map((player) =>
            row(
              player,
              "Guest · hasn’t claimed their history",
              <CopyClaimLink code={player.claimCode!} />,
            ),
          )}
        </List>
      </View>
      {former.length > 0 ? (
        <View className="gap-2">
          <SectionHeading>Former members</SectionHeading>
          <List>
            {former.map((player) =>
              row(player, player.userId === null ? "Removed guest" : "Left the group"),
            )}
          </List>
          <Text className="px-1 text-sm text-muted">Their history stays in the ledger.</Text>
        </View>
      ) : null}
      {action === "invite" ? (
        <Sheet open title="Invite" onClose={() => setAction(null)}>
          <Button label="Add a guest" onPress={() => setAction("guest")} />
          <InviteSection detail={detail} />
        </Sheet>
      ) : null}
      <AddGuestSheet detail={detail} open={action === "guest"} onClose={() => setAction(null)} />
      {opened ? (
        <PlayerSheet
          detail={detail}
          player={opened}
          viewer={viewer}
          removing={removing}
          onClose={() => setOpenedId(null)}
        />
      ) : null}
    </>
  );
}

function CopyClaimLink({ code }: { code: string }) {
  const toast = useToast();

  return (
    <Button
      label="Copy link"
      size="sm"
      icon={Platform.OS === "android" ? <Icon name="link" color="ink" size={16} /> : undefined}
      onPress={() =>
        void setStringAsync(inviteUrl("claim", code)).then(
          (copied) =>
            toast({ message: copied ? "Claim link copied" : "The claim link couldn’t be copied" }),
          () => toast({ message: "The claim link couldn’t be copied" }),
        )
      }
    />
  );
}

function InviteSection({ detail }: { detail: GroupDetail }) {
  const stacks = useStacks();
  const create = useAction(stacks.Client.mutation("invites", "create"));
  const revoke = useAction(stacks.Client.mutation("invites", "revoke"));

  return (
    <View className="gap-2">
      <SectionHeading
        action={
          <Button
            label="New invite link"
            size="sm"
            pending={create.pending}
            onPress={() =>
              void create.run({
                params: { groupId: detail.group.id },
                payload: { id: InviteId.make(newId()), maxUses: null },
              })
            }
          />
        }
      >
        Invite links
      </SectionHeading>
      <Loaded query={stacks.invites(detail.group.id)} skeleton={<InviteLinkSkeleton />}>
        {(invites) =>
          invites.length === 0 ? (
            <Text className="text-sm text-muted">
              Make a link and send it to anyone you want in the group. Links last a week.
            </Text>
          ) : (
            <List>
              {invites.map((invite) => {
                const url = inviteUrl("join", invite.code);

                return (
                  <Row key={invite.id} className="flex-col items-stretch gap-2">
                    <Text selectable numberOfLines={1} className="tabular-nums text-sm text-ink">
                      {url}
                    </Text>
                    <Text className="text-sm text-muted">
                      Expires {formatDay(invite.expiresAt)} · used {invite.uses}{" "}
                      {invite.uses === 1 ? "time" : "times"}
                    </Text>
                    <View className="flex-row gap-2">
                      <Button
                        label="Share"
                        size="sm"
                        className="flex-1"
                        onPress={() =>
                          void shareLink(url, `Join ${detail.group.name} on Color Up:`)
                        }
                      />
                      <Button
                        label="Revoke"
                        size="sm"
                        variant={Platform.OS === "android" ? "danger" : "ghost"}
                        pending={revoke.pending}
                        onPress={() =>
                          confirmAction(
                            "Revoke this invite link?",
                            "Anyone who has not joined yet will need a new link.",
                            "Revoke link",
                            () => {
                              void revoke.run({ params: { inviteId: invite.id } });
                            },
                          )
                        }
                      />
                    </View>
                  </Row>
                );
              })}
            </List>
          )
        }
      </Loaded>
      {create.error ? <FormError>{create.error}</FormError> : null}
      {revoke.error ? <FormError>{revoke.error}</FormError> : null}
    </View>
  );
}

function PlayerSheet({
  detail,
  player,
  viewer,
  removing,
  onClose,
}: {
  detail: GroupDetail;
  player: Player;
  viewer: Parameters<typeof playerActions>[0];
  removing: boolean;
  onClose: () => void;
}) {
  const stacks = useStacks();
  const setRole = useAction(stacks.Client.mutation("groups", "setRole"));
  const removeMember = useAction(stacks.Client.mutation("groups", "removeMember"));
  const removeGuest = useAction(stacks.Client.mutation("guests", "remove"));
  const addBack = useAction(stacks.Client.mutation("guests", "restore"));
  const actions = playerActions(viewer, player);

  const memberParams =
    player.userId === null ? null : { groupId: detail.group.id, userId: player.userId };

  const guestParams = { groupId: detail.group.id, playerId: player.id };
  const [confirming, setConfirming] = useState(removing);
  const [copyError, setCopyError] = useState(false);
  const android = Platform.OS === "android";

  if (confirming) {
    const remove = actions.removeGuest ? removeGuest : removeMember;

    const run = () =>
      actions.removeGuest
        ? removeGuest.run({ params: guestParams })
        : memberParams
          ? removeMember.run({ params: memberParams })
          : Promise.resolve(null);

    return (
      <Sheet
        open
        onClose={onClose}
        title={`Remove ${player.displayName}?`}
        description={
          actions.removeGuest
            ? "Their claim link stops working. If they’ve played, their history stays in the ledger and you can add them back."
            : "They lose access to the group. Their history stays in the ledger, and you can invite them back."
        }
        footer={
          <>
            <Button
              label="Remove"
              variant="danger"
              size="lg"
              pending={remove.pending}
              onPress={() =>
                void run().then((saved) => {
                  if (saved) onClose();
                })
              }
            />
            <Button
              label="Keep them"
              onPress={() => (removing ? onClose() : setConfirming(false))}
            />
          </>
        }
      >
        {remove.error ? <FormError>{remove.error}</FormError> : null}
      </Sheet>
    );
  }

  const claim = () => {
    if (!player.claimCode) return;

    const url = inviteUrl("claim", player.claimCode);

    if (android) {
      setCopyError(false);
      void setStringAsync(url).then(
        (copied) => setCopyError(!copied),
        () => setCopyError(true),
      );
    } else {
      void shareLink(url, `Claim your Color Up history in ${detail.group.name}:`);
    }
  };

  return (
    <Sheet open onClose={onClose} title={player.displayName}>
      <ContactPhotoControls playerId={player.id} name={player.displayName} />
      {actions.claimLink ? (
        <Button
          label={android ? "Copy claim link" : "Send claim link"}
          icon={android ? <Icon name="link" color="ink" size={16} /> : undefined}
          onPress={claim}
        />
      ) : null}
      {copyError ? <FormError>The claim link couldn’t be copied. Try again.</FormError> : null}
      {actions.changeRole && memberParams ? (
        <Button
          label={player.role === "admin" ? "Make a member" : "Make an admin"}
          pending={setRole.pending}
          onPress={() =>
            void setRole
              .run({
                params: memberParams,
                payload: { role: player.role === "admin" ? "member" : "admin" },
              })
              .then((saved) => {
                if (saved) onClose();
              })
          }
        />
      ) : null}
      {actions.addBack ? (
        <>
          <Button
            label="Add back to group"
            pending={addBack.pending}
            onPress={() =>
              void addBack.run({ params: guestParams }).then((saved) => {
                if (saved) onClose();
              })
            }
          />
          <Text className="text-sm text-muted">They get a new claim link.</Text>
        </>
      ) : null}
      {actions.manage || actions.removeGuest ? (
        <>
          <Button label="Remove from group" variant="danger" onPress={() => setConfirming(true)} />
          <Text className="text-sm text-muted">Their history stays in the group's ledger.</Text>
        </>
      ) : null}
      {setRole.error ? <FormError>{setRole.error}</FormError> : null}
      {addBack.error ? <FormError>{addBack.error}</FormError> : null}
    </Sheet>
  );
}
