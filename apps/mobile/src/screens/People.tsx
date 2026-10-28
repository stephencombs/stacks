import { useAuth } from "@clerk/expo";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import {
  GroupId,
  InviteId,
  UserId,
  type GroupDetail,
  type Invite,
  type Player,
} from "@stacks/contracts";
import { formatDay } from "@stacks/client-runtime/format";
import { newId } from "@stacks/client-runtime/ids";
import { useState } from "react";
import { Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { FormError } from "../components/ui/Field";
import { Screen } from "../components/ui/Screen";
import { Sheet } from "../components/ui/Sheet";
import { List, Row, SectionHeading, Skeleton, Tag } from "../components/ui/Surface";
import { AddGuestSheet } from "../features/AddGuestSheet";
import { webUrl } from "../lib/config";
import { shareLink } from "../lib/share";
import { Loaded, useAction, useStacks } from "../lib/stacks";

type Props = StaticScreenProps<{ groupId: string }>;

export function PeopleScreen({ route }: Props) {
  const stacks = useStacks();
  return (
    <Screen>
      <Loaded
        query={stacks.group(GroupId.make(route.params.groupId))}
        skeleton={<Skeleton className="h-96" />}
      >
        {(detail) => <PeopleView detail={detail} />}
      </Loaded>
    </Screen>
  );
}

const roleNames = { owner: "Owner", admin: "Admin", member: "Member" } as const;

function PeopleView({ detail }: { detail: GroupDetail }) {
  const [addingGuest, setAddingGuest] = useState(false);
  const [managing, setManaging] = useState<Player | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [shared, setShared] = useState<string | null>(null);
  const { userId } = useAuth();
  const members = detail.players.filter((player) => player.role !== null);
  const guests = detail.players.filter((player) => player.userId === null);
  const canManage = (player: Player) =>
    player.userId !== null &&
    player.userId !== userId &&
    player.role !== "owner" &&
    (detail.role === "owner" || (detail.role === "admin" && player.role === "member"));

  const share = async (url: string, message: string, key: string) => {
    if ((await shareLink(url, message)) === "copied") setShared(key);
  };

  return (
    <>
      <InviteSection detail={detail} />
      <View className="gap-2">
        <SectionHeading>Members</SectionHeading>
        <List>
          {members.map((player) => (
            <Row
              key={player.id}
              {...(canManage(player)
                ? {
                    onPress: () => setManaging(player),
                    accessibilityHint: "Change their role or remove them",
                  }
                : {})}
            >
              <Text numberOfLines={1} className="flex-1 text-base text-ink">
                {player.displayName}
                {player.id === detail.myPlayerId ? (
                  <Text className="text-muted"> (you)</Text>
                ) : null}
              </Text>
              {player.role ? <Tag>{roleNames[player.role]}</Tag> : null}
            </Row>
          ))}
        </List>
      </View>
      <View className="gap-2">
        <SectionHeading
          action={
            <Button
              label="Add a guest"
              size="sm"
              variant="ghost"
              onPress={() => setAddingGuest(true)}
            />
          }
        >
          Guests
        </SectionHeading>
        {guests.length === 0 ? (
          <Text className="text-sm text-muted">
            Add friends who aren't on Stacks yet. Send them their claim link when they sign up and
            their history becomes theirs.
          </Text>
        ) : (
          <List>
            {guests.map((player) => (
              <Row key={player.id}>
                <Text className="flex-1 text-base text-ink">{player.displayName}</Text>
                {player.claimCode ? (
                  <Button
                    label={shared === player.id ? "Copied" : "Send claim link"}
                    size="sm"
                    onPress={() =>
                      void share(
                        `${webUrl}/claim/${player.claimCode}`,
                        `Claim your Stacks history in ${detail.group.name}:`,
                        player.id,
                      )
                    }
                  />
                ) : null}
              </Row>
            ))}
          </List>
        )}
      </View>
      <View className="gap-2 border-t border-line pt-6">
        <Button label="Leave group" variant="danger" onPress={() => setLeaving(true)} />
        <Text className="text-sm text-muted">You can only leave once you're settled up.</Text>
      </View>
      <AddGuestSheet detail={detail} open={addingGuest} onClose={() => setAddingGuest(false)} />
      {managing ? (
        <ManageMemberSheet detail={detail} player={managing} onClose={() => setManaging(null)} />
      ) : null}
      {leaving ? <LeaveSheet detail={detail} onClose={() => setLeaving(false)} /> : null}
    </>
  );
}

function InviteSection({ detail }: { detail: GroupDetail }) {
  const stacks = useStacks();
  const create = useAction(stacks.Client.mutation("invites", "create"));
  const [revoking, setRevoking] = useState<Invite | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
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
      <Loaded query={stacks.invites(detail.group.id)} skeleton={<Skeleton className="h-16" />}>
        {(invites) =>
          invites.length === 0 ? (
            <Text className="text-sm text-muted">
              Make a link and send it to anyone you want in the group. Links last a week.
            </Text>
          ) : (
            <List>
              {invites.map((invite) => {
                const url = `${webUrl}/join/${invite.code}`;
                return (
                  <Row key={invite.id} className="flex-col items-stretch gap-2">
                    <Text selectable numberOfLines={1} className="font-mono text-sm text-ink">
                      {url}
                    </Text>
                    <Text className="text-sm text-muted">
                      Expires {formatDay(invite.expiresAt)} · used {invite.uses}{" "}
                      {invite.uses === 1 ? "time" : "times"}
                    </Text>
                    <View className="flex-row gap-2">
                      <Button
                        label={copied === invite.id ? "Copied" : "Share"}
                        size="sm"
                        className="flex-1"
                        onPress={() =>
                          void shareLink(url, `Join ${detail.group.name} on Stacks:`).then((how) =>
                            how === "copied" ? setCopied(invite.id) : undefined,
                          )
                        }
                      />
                      <Button
                        label="Revoke"
                        size="sm"
                        variant="ghost"
                        onPress={() => setRevoking(invite)}
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
      {revoking ? <RevokeSheet invite={revoking} onClose={() => setRevoking(null)} /> : null}
    </View>
  );
}

function ManageMemberSheet({
  detail,
  player,
  onClose,
}: {
  detail: GroupDetail;
  player: Player;
  onClose: () => void;
}) {
  const stacks = useStacks();
  const setRole = useAction(stacks.Client.mutation("groups", "setRole"));
  const remove = useAction(stacks.Client.mutation("groups", "removeMember"));
  const params = { groupId: detail.group.id, userId: UserId.make(player.userId!) };
  const done = (ok: unknown) => (ok ? onClose() : undefined);
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <Sheet
        open
        onClose={onClose}
        title={`Remove ${player.displayName}?`}
        description="They lose access to the group. Their history stays in the ledger, and you can invite them back."
      >
        {remove.error ? <FormError>{remove.error}</FormError> : null}
        <Button
          label="Remove"
          variant="danger"
          size="lg"
          pending={remove.pending}
          onPress={() => void remove.run({ params }).then(done)}
        />
        <Button label="Keep them" onPress={() => setConfirming(false)} />
      </Sheet>
    );
  }
  return (
    <Sheet open onClose={onClose} title={player.displayName}>
      {detail.role === "owner" ? (
        <Button
          label={player.role === "admin" ? "Make a member" : "Make an admin"}
          pending={setRole.pending}
          onPress={() =>
            void setRole
              .run({ params, payload: { role: player.role === "admin" ? "member" : "admin" } })
              .then(done)
          }
        />
      ) : null}
      <Button label="Remove from group" variant="danger" onPress={() => setConfirming(true)} />
      <Text className="text-sm text-muted">Their history stays in the group's ledger.</Text>
      {setRole.error ? <FormError>{setRole.error}</FormError> : null}
    </Sheet>
  );
}

function LeaveSheet({ detail, onClose }: { detail: GroupDetail; onClose: () => void }) {
  const stacks = useStacks();
  const navigation = useNavigation();
  const leave = useAction(stacks.Client.mutation("groups", "leave"));
  const confirm = async () => {
    if (await leave.run({ params: { groupId: detail.group.id } })) {
      onClose();
      navigation.navigate("Groups");
    }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Leave ${detail.group.name}?`}
      description="Your history stays in the group's ledger. Someone can invite you back."
    >
      {leave.error ? <FormError>{leave.error}</FormError> : null}
      <Button
        label="Leave group"
        variant="danger"
        size="lg"
        pending={leave.pending}
        onPress={() => void confirm()}
      />
      <Button label="Stay" onPress={onClose} />
    </Sheet>
  );
}

function RevokeSheet({ invite, onClose }: { invite: Invite; onClose: () => void }) {
  const stacks = useStacks();
  const revoke = useAction(stacks.Client.mutation("invites", "revoke"));
  const confirm = async () => {
    if (await revoke.run({ params: { inviteId: invite.id } })) onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Revoke this invite link?"
      description="Anyone who hasn't joined yet will need a new link."
    >
      <Text numberOfLines={1} className="font-mono text-sm text-muted">
        {`${webUrl}/join/${invite.code}`}
      </Text>
      {revoke.error ? <FormError>{revoke.error}</FormError> : null}
      <Button
        label="Revoke link"
        variant="danger"
        size="lg"
        pending={revoke.pending}
        onPress={() => void confirm()}
      />
      <Button label="Keep it" onPress={onClose} />
    </Sheet>
  );
}
