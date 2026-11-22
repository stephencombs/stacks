import { useAuth } from "@clerk/expo";
import { InviteId, UserId, type GroupDetail, type Player } from "@stacks/contracts";
import {
  distinctPlayerNames,
  formatDay,
  isFormerMember,
  isGuest,
} from "@stacks/client-runtime/format";
import { newId } from "@stacks/client-runtime/ids";
import { chipOf } from "@stacks/client-runtime/trip";
import { setStringAsync } from "expo-clipboard";
import { useState } from "react";
import { Platform, View } from "react-native";
import { Text } from "../components/ui/Text";

import { confirmAction } from "../components/ui/confirmAction";
import { Button } from "../components/ui/Button";
import { FormError } from "../components/ui/Field";
import { Icon } from "../components/ui/Icon";
import { Sheet } from "../components/ui/Sheet";
import { List, Row, SectionHeading, Tag } from "../components/ui/Surface";
import { appUrl } from "../lib/config";
import { shareLink } from "../lib/share";
import { Loaded, useAction, useStacks } from "../lib/stacks";
import { AddGuestSheet } from "./AddGuestSheet";
import { Chip } from "./Chip";
import { InviteLinkSkeleton } from "./ScreenSkeletons";

const roleNames = { owner: "Owner", admin: "Admin", member: "Member" } as const;

/** Everyone in the group: members and their roles, guests, invite links, and who left. */
export function GroupPeople({ detail }: { detail: GroupDetail }) {
  const [action, setAction] = useState<"invite" | "guest" | null>(null);
  const [managing, setManaging] = useState<Player | null>(null);
  const [copyError, setCopyError] = useState(false);
  const android = Platform.OS === "android";
  const { userId } = useAuth();
  const members = detail.players.filter((player) => player.role !== null);
  const guests = detail.players.filter(isGuest);
  const former = detail.players.filter(isFormerMember);

  const names = distinctPlayerNames(
    [...members, ...guests, ...former].map((player) => [player.id, player.displayName]),
  );

  const canManage = (player: Player) =>
    player.userId !== null &&
    player.userId !== userId &&
    player.role !== "owner" &&
    (detail.role === "owner" || (detail.role === "admin" && player.role === "member"));

  const memberRows = members.map((player) => (
    <Row
      key={player.id}
      {...(canManage(player)
        ? {
            onPress: () => setManaging(player),
            accessibilityHint: "Change their role or remove them",
          }
        : {})}
    >
      <Chip
        chip={chipOf(detail, player.id)}
        name={player.displayName}
        size={android ? 36 : 26}
        ring={android}
      />
      <View className="min-w-0 flex-1">
        <Text
          numberOfLines={android ? 2 : 1}
          className={android ? "type-heading font-bold text-ink" : "text-base text-ink"}
        >
          {names.get(player.id)}
          {player.id === detail.myPlayerId ? <Text className="text-muted"> · you</Text> : null}
        </Text>
        {android && player.role ? (
          <Text className="type-footnote text-muted">{roleNames[player.role]}</Text>
        ) : null}
      </View>
      {!android && player.role ? <Tag>{roleNames[player.role]}</Tag> : null}
    </Row>
  ));

  const guestRows = guests.map((player) => (
    <Row key={player.id} className="flex-wrap">
      <Chip
        chip={chipOf(detail, player.id)}
        name={player.displayName}
        size={android ? 36 : 26}
        ring={android}
      />
      <View className={android ? "min-w-0 flex-1 basis-24" : "flex-1 basis-32"}>
        <Text className={android ? "type-heading font-bold text-ink" : "text-base text-ink"}>
          {names.get(player.id)}
        </Text>
        {android ? (
          <Text className="type-footnote text-muted">
            {player.claimCode ? "Guest · hasn’t claimed their history" : "Guest"}
          </Text>
        ) : null}
      </View>
      {player.claimCode ? (
        <Button
          label={android ? "Copy link" : "Send claim link"}
          size="sm"
          className="ml-auto"
          icon={android ? <Icon name="link" color="ink" size={16} /> : undefined}
          onPress={() => {
            const url = appUrl(`claim/${player.claimCode}`);

            if (android) {
              setCopyError(false);
              void setStringAsync(url).then(
                (copied) => setCopyError(!copied),
                () => setCopyError(true),
              );
            } else {
              void shareLink(url, `Claim your Color Up history in ${detail.group.name}:`);
            }
          }}
        />
      ) : null}
    </Row>
  ));

  return (
    <>
      {android ? (
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
            {memberRows}
            {guestRows}
          </List>
          {copyError ? <FormError>The claim link couldn’t be copied. Try again.</FormError> : null}
        </View>
      ) : (
        <>
          <View className="gap-2">
            <SectionHeading>Members</SectionHeading>
            <List>{memberRows}</List>
          </View>
          <View className="gap-2">
            <SectionHeading
              action={
                <Button
                  label="Add a guest"
                  size="sm"
                  variant="ghost"
                  onPress={() => setAction("guest")}
                />
              }
            >
              Guests
            </SectionHeading>
            {guests.length === 0 ? (
              <Text className="text-sm text-muted">
                Add friends who aren't on Color Up yet. Send them their claim link when they sign up
                and their history becomes theirs.
              </Text>
            ) : (
              <List>{guestRows}</List>
            )}
          </View>
          <InviteSection detail={detail} />
        </>
      )}
      {action === "invite" ? (
        <Sheet open title="Invite" onClose={() => setAction(null)}>
          <Button label="Add a guest" onPress={() => setAction("guest")} />
          <InviteSection detail={detail} />
        </Sheet>
      ) : null}
      {former.length > 0 ? (
        <View className="gap-2">
          <SectionHeading>Former members</SectionHeading>
          <Text className="text-sm text-muted">
            {former.map((player) => names.get(player.id)).join(", ")}. Their history stays in the
            ledger.
          </Text>
        </View>
      ) : null}
      <AddGuestSheet detail={detail} open={action === "guest"} onClose={() => setAction(null)} />
      {managing ? (
        <ManageMemberSheet detail={detail} player={managing} onClose={() => setManaging(null)} />
      ) : null}
    </>
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
                const url = appUrl(`join/${invite.code}`);

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
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <Sheet
        open
        onClose={onClose}
        title={`Remove ${player.displayName}?`}
        description="They lose access to the group. Their history stays in the ledger, and you can invite them back."
        footer={
          <>
            <Button
              label="Remove"
              variant="danger"
              size="lg"
              pending={remove.pending}
              onPress={() =>
                void remove.run({ params }).then((saved) => {
                  if (saved) onClose();
                })
              }
            />
            <Button label="Keep them" onPress={() => setConfirming(false)} />
          </>
        }
      >
        {remove.error ? <FormError>{remove.error}</FormError> : null}
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
              .then((saved) => {
                if (saved) onClose();
              })
          }
        />
      ) : null}
      <Button label="Remove from group" variant="danger" onPress={() => setConfirming(true)} />
      <Text className="text-sm text-muted">Their history stays in the group's ledger.</Text>
      {setRole.error ? <FormError>{setRole.error}</FormError> : null}
    </Sheet>
  );
}
